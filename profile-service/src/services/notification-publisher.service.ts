import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { createHash, randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { AuthenticatedUser } from "../types/express.js";

let connection: ChannelModel | undefined;
let channelPromise: Promise<ConfirmChannel> | undefined;

// Derive a stable UUID per user so repeated onboarding saves produce the same eventId
// and notification-service de-duplicates the welcome email.
function welcomeEventId(userId: string): string {
  const bytes = createHash("sha1").update(`welcome:${userId}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// Reuse one publisher-confirm channel; reset it on disconnect so the next publish reconnects.
async function getPublisherChannel(): Promise<ConfirmChannel> {
  if (!channelPromise) {
    channelPromise = (async () => {
      const activeConnection = await amqp.connect(config.rabbitmqUrl);
      connection = activeConnection;
      activeConnection.on("error", (error) =>
        console.error("[profile-service] RabbitMQ connection error:", error),
      );
      activeConnection.on("close", () => {
        if (connection === activeConnection) {
          connection = undefined;
          channelPromise = undefined;
        }
      });

      try {
        const channel = await activeConnection.createConfirmChannel();
        await channel.assertQueue(config.notificationQueue, { durable: true });
        return channel;
      } catch (error) {
        if (connection === activeConnection) connection = undefined;
        await activeConnection.close().catch(() => undefined);
        throw error;
      }
    })().catch((error: unknown) => {
      channelPromise = undefined;
      throw error;
    });
  }
  return channelPromise;
}

// Queue the welcome email once a user finishes onboarding (employer company created or
// talent profile saved). Never throws: a messaging outage must not fail onboarding itself.
async function publishWelcomeEmail(user: AuthenticatedUser): Promise<void> {
  if (config.nodeEnv === "test") return;

  try {
    const eventId = welcomeEventId(user.id);
    const channel = await getPublisherChannel();
    const event = {
      eventId,
      eventType: "user.signed_up",
      occurredAt: new Date().toISOString(),
      user: {
        id: user.id,
        name: user.name ?? "",
        email: user.email,
        createdAt: new Date(
          typeof user.createdAt === "string" ? user.createdAt : Date.now(),
        ).toISOString(),
      },
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
  } catch (error) {
    console.error("[profile-service] Failed to queue welcome email:", error);
  }
}

export interface TeamInviteEmail {
  email: string;
  token: string;
  companyName: string;
  inviterName: string;
  role: "ADMIN" | "MEMBER";
  expiresAt: Date;
}

// Queue a team invitation email. Throws on failure so the caller can report which invites were not sent.
async function publishTeamInviteEmail(invite: TeamInviteEmail): Promise<void> {
  if (config.nodeEnv === "test") return;

  const eventId = randomUUID();
  const channel = await getPublisherChannel();
  const event = {
    eventId,
    eventType: "company.team_invite",
    occurredAt: new Date().toISOString(),
    invite: {
      email: invite.email,
      token: invite.token,
      companyName: invite.companyName,
      inviterName: invite.inviterName,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    },
  };
  channel.sendToQueue(config.notificationQueue, Buffer.from(JSON.stringify(event)), {
    contentType: "application/json",
    persistent: true,
    messageId: eventId,
    timestamp: Date.now(),
  });
  await channel.waitForConfirms();
}

// Close publisher resources during graceful shutdown.
async function closeNotificationPublisher(): Promise<void> {
  const pendingChannel = channelPromise;
  if (!pendingChannel) return;

  try {
    const channel = await pendingChannel;
    await channel.close();
  } catch (error) {
    console.error("[profile-service] Failed to close RabbitMQ channel:", error);
  } finally {
    await connection?.close().catch(() => undefined);
    connection = undefined;
    channelPromise = undefined;
  }
}

export { publishWelcomeEmail, publishTeamInviteEmail, closeNotificationPublisher };
