import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface SignedUpUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface UserSignedUpEvent {
  eventId: string;
  eventType: "user.signed_up";
  occurredAt: string;
  user: SignedUpUser;
}

export interface EmailVerificationRequestedEvent {
  eventId: string;
  eventType: "user.email_verification_requested";
  occurredAt: string;
  user: SignedUpUser;
  verificationUrl: string;
}

let connection: ChannelModel | undefined;
let channelPromise: Promise<ConfirmChannel> | undefined;

// Reuse a publisher-confirm channel; reset it on disconnect so the next signup reconnects.
async function getPublisherChannel(): Promise<ConfirmChannel> {
  if (!channelPromise) {
    channelPromise = (async () => {
      const activeConnection = await amqp.connect(config.rabbitmqUrl);
      connection = activeConnection;
      activeConnection.on("error", (error) =>
        logger("error", "RabbitMQ publisher connection error:", error),
      );
      activeConnection.on("close", () => {
        if (connection === activeConnection) {
          connection = undefined;
          channelPromise = undefined;
        }
        logger(
          "warn",
          "RabbitMQ connection closed; signup events will reconnect on demand",
        );
      });

      try {
        const channel = await activeConnection.createConfirmChannel();
        await channel.assertQueue(config.notificationQueue, { durable: true });
        logger(
          "info",
          `RabbitMQ publisher connected to queue ${config.notificationQueue}`,
        );
        return channel;
      } catch (error) {
        if (connection === activeConnection) connection = undefined;
        try {
          await activeConnection.close();
        } catch (closeError) {
          logger(
            "warn",
            "Failed to close RabbitMQ after publisher setup failed:",
            closeError,
          );
        }
        throw error;
      }
    })().catch((error: unknown) => {
      channelPromise = undefined;
      throw error; // Propagate the error to the caller so it can be logged and handled.
    });
  }

  return channelPromise;
}

// Confirm the durable queue accepted each signup event before reporting publish success.
async function queueSignupNotification(user: SignedUpUser): Promise<void> {
  const channel = await getPublisherChannel();
  const event: UserSignedUpEvent = {
    eventId: randomUUID(),
    eventType: "user.signed_up",
    occurredAt: new Date().toISOString(),
    user,
  };

  channel.sendToQueue(
    config.notificationQueue,
    Buffer.from(JSON.stringify(event)),
    {
      contentType: "application/json",
      persistent: true,
      messageId: event.eventId,
      timestamp: Date.now(),
    },
  );
  await channel.waitForConfirms();
  logger("info", `Queued signup notification ${event.eventId}`);
}

// Close publisher resources during graceful service shutdown.
async function closeNotificationPublisher(): Promise<void> {
  const pendingChannel = channelPromise;
  if (!pendingChannel) return;

  try {
    const channel = await pendingChannel;
    await channel.close();
  } finally {
    await connection?.close();
    connection = undefined;
    channelPromise = undefined;
  }
}

export { queueSignupNotification, closeNotificationPublisher };

export interface PasswordResetRequestedEvent {
  eventId: string;
  eventType: "user.password_reset_requested";
  occurredAt: string;
  user: SignedUpUser;
  resetUrl: string;
}

// Queue the reset email; the notification-service renders and sends it.
export async function queuePasswordReset(
  user: SignedUpUser,
  resetUrl: string,
): Promise<void> {
  const channel = await getPublisherChannel();
  const event: PasswordResetRequestedEvent = {
    eventId: randomUUID(),
    eventType: "user.password_reset_requested",
    occurredAt: new Date().toISOString(),
    user,
    resetUrl,
  };

  channel.sendToQueue(
    config.notificationQueue,
    Buffer.from(JSON.stringify(event)),
    {
      contentType: "application/json",
      persistent: true,
      messageId: event.eventId,
      timestamp: Date.now(),
    },
  );
  await channel.waitForConfirms();
  logger("info", `Queued password reset email for user ${user.id}`);
}

export async function queueEmailVerification(
  user: SignedUpUser,
  verificationUrl: string,
): Promise<void> {
  const channel = await getPublisherChannel();
  const event: EmailVerificationRequestedEvent = {
    eventId: randomUUID(),
    eventType: "user.email_verification_requested",
    occurredAt: new Date().toISOString(),
    user,
    verificationUrl,
  };

  channel.sendToQueue(
    config.notificationQueue,
    Buffer.from(JSON.stringify(event)),
    {
      contentType: "application/json",
      persistent: true,
      messageId: event.eventId,
      timestamp: Date.now(),
    },
  );
  await channel.waitForConfirms();
  logger("info", `Queued email verification for user ${user.id}`);
}
