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

export interface EmailVerificationRequestedEvent {
  eventId: string;
  eventType: "user.email_verification_requested";
  occurredAt: string;
  user: SignedUpUser;
  verificationUrl: string;
}

export interface PasswordChangedEvent {
  eventId: string;
  eventType: "user.password_changed";
  occurredAt: string;
  user: SignedUpUser;
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

// Shared publish path: wraps the payload in the standard event envelope, sends it to the
// durable queue and waits for the broker's confirmation before reporting success.
async function publishEvent<
  TType extends string,
  TPayload extends Record<string, unknown>,
>(
  eventType: TType,
  payload: TPayload,
  eventId: string = randomUUID(),
): Promise<void> {
  const channel = await getPublisherChannel();
  const event = {
    eventId,
    eventType,
    occurredAt: new Date().toISOString(),
    ...payload,
  };

  channel.sendToQueue(
    config.notificationQueue,
    Buffer.from(JSON.stringify(event)),
    {
      contentType: "application/json",
      persistent: true,
      messageId: eventId,
      timestamp: Date.now(),
    },
  );
  await channel.waitForConfirms();
  logger("info", `Queued ${eventType} event ${eventId}`);
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

// Queue the reset email; the notification-service renders and sends it.
async function queuePasswordReset(
  user: SignedUpUser,
  resetUrl: string,
): Promise<void> {
  await publishEvent("user.password_reset_requested", { user, resetUrl });
}

// Queue the verification email with the link Better Auth generated.
async function queueEmailVerification(
  user: SignedUpUser,
  verificationUrl: string,
): Promise<void> {
  await publishEvent("user.email_verification_requested", {
    user,
    verificationUrl,
  });
}

// Queue the password-changed confirmation; the notification-service renders and sends it.
async function queuePasswordChanged(user: SignedUpUser): Promise<void> {
  await publishEvent("user.password_changed", { user });
}

export {
  queuePasswordReset,
  queueEmailVerification,
  queuePasswordChanged,
  closeNotificationPublisher,
};
