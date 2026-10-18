import amqp, { type Channel, type ChannelModel } from "amqplib";
import * as Sentry from "@sentry/node";
import { z } from "zod";
import { config } from "../config.js";
import { sendEmailNotification } from "./email-notification.service.js";
import {
  createNotification,
  findNotificationById,
} from "../models/notification.model.js";
import { logger } from "../utils/logger.js";

const signupEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("user.signed_up"),
  occurredAt: z.iso.datetime(),
  user: z.object({
    id: z.string().min(1),
    name: z.string(),
    email: z.email(),
    createdAt: z.iso.datetime(),
  }),
});

type ConsumerSession = {
  connection: ChannelModel;
  channel: Channel;
  closed: Promise<void>;
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

// Create a RabbitMQ consumer session that listens for signup events and invokes the provided callback for each message.
async function createConsumerSession(
  onMessage: (message: amqp.ConsumeMessage | null, channel: Channel) => void,
): Promise<ConsumerSession> {
  const connection = await amqp.connect(config.rabbitmqUrl);
  connection.on("error", (error) =>
    logger("error", "RabbitMQ connection error:", error),
  );
  const closed = new Promise<void>((resolve) => {
    connection.once("close", resolve);
  });

  const channel = await connection.createChannel();
  channel.on("error", (error) =>
    logger("error", "RabbitMQ consumer channel error:", error),
  );
  await channel.assertQueue(config.notificationQueue, { durable: true });
  await channel.prefetch(1);

  // Start consuming messages from the queue.
  // config.notificationQueue is the name of the queue to consume from.
  await channel.consume(
    config.notificationQueue,
    (message) => onMessage(message, channel),
    { noAck: false },
  );

  return { connection, channel, closed };
}

// Deliver a signup email notification for the given RabbitMQ message, acknowledge.
async function deliverSignupEmail(
  message: amqp.ConsumeMessage | null,
  channel: Channel,
): Promise<void> {
  if (!message) return;

  let decoded: unknown;
  try {
    decoded = JSON.parse(message.content.toString("utf8"));
  } catch (error) {
    logger("error", "Discarding malformed signup notification JSON:", error);
    channel.ack(message); // Acknowledge the message to remove it from the queue.
    return;
  }

  // Parse the decoded message using the Zod schema.
  const parsed = signupEventSchema.safeParse(decoded);
  if (!parsed.success) {
    logger(
      "error",
      "Discarding invalid signup notification event:",
      parsed.error,
    );
    channel.ack(message); // Acknowledge the message to remove it from the queue.
    return;
  }

  const { eventId, user } = parsed.data;
  try {
    // Check if the notification has already been saved to avoid duplicate emails on redelivery.
    if (await findNotificationById(eventId)) {
      channel.ack(message); // Acknowledge the message to remove it from the queue (success).
      logger("info", `Signup notification ${eventId} was already saved`);
      return;
    }

    const title = "Welcome to Internflare";
    const body =
      "Your account has been created successfully. Explore opportunities, build your profile, and take the next step in your career.";
    const link = new URL("/app", config.frontendUrl).toString();

    await sendEmailNotification({
      type: "account",
      to: user.email,
      recipientName: user.name || undefined,
      subject: title,
      message: body,
      action: { label: "Open your dashboard", url: link },
    });
    await createNotification({
      id: eventId,
      user_id: user.id,
      type: "account",
      title,
      body,
      link,
      channel: "email",
    });
    channel.ack(message); // Acknowledge the message to remove it from the queue (success).
    logger("info", `Delivered signup email for event ${eventId}`);
  } catch (error) {
    // Keep the persistent event queued when Resend is unavailable; RabbitMQ will retry it.
    Sentry.captureException(error, {
      tags: { operation: "deliver-signup-email" },
      extra: { eventId },
    });
    logger(
      "error",
      `Signup email delivery failed for event ${eventId}:`,
      error,
    );
    await wait(1_000);
    channel.nack(message, false, true); // Requeue the message for retry; RabbitMQ will redeliver it later.
  }
}

// Consume confirmed signup events, reconnecting to RabbitMQ after broker restarts.
async function startSignupNotificationConsumer(): Promise<() => Promise<void>> {
  let stopping = false;
  let session: ConsumerSession | undefined;

  const processMessages = (
    message: amqp.ConsumeMessage | null,
    channel: Channel,
  ) => {
    void deliverSignupEmail(message, channel).catch((error: unknown) => {
      logger(
        "error",
        "Unexpected signup notification consumer failure:",
        error,
      );
    });
  };

  // Wait for an initial connection before declaring the notification worker ready.
  session = await createConsumerSession(processMessages);

  const reconnect = async () => {
    let activeSession: ConsumerSession | undefined = session;

    while (!stopping) {
      if (activeSession) {
        await activeSession.closed;
        if (stopping) break;

        logger("warn", "RabbitMQ connection closed; reconnecting in 3 seconds");
        try {
          await activeSession.connection.close();
        } catch {
          // The broker may already have closed the connection.
        }
        activeSession = undefined;
        session = undefined;
      }

      await wait(3_000);
      while (!stopping && !activeSession) {
        try {
          activeSession = await createConsumerSession(processMessages);
          session = activeSession;
          logger(
            "info",
            "Reconnected signup notification consumer to RabbitMQ",
          );
        } catch (error) {
          logger("error", "RabbitMQ consumer reconnect failed:", error);
          await wait(3_000);
        }
      }
    }
  };

  const reconnectTask = reconnect();
  void reconnectTask.catch((error: unknown) => {
    logger("error", "RabbitMQ consumer stopped unexpectedly:", error);
  });

  return async () => {
    stopping = true;
    if (session) {
      try {
        await session.connection.close();
      } catch {
        logger("warn", "RabbitMQ consumer connection was already closed");
      }
    }
    await reconnectTask;
    session = undefined;
  };
}

export { startSignupNotificationConsumer };
