import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

let connection: ChannelModel | undefined;
let channelPromise: Promise<ConfirmChannel> | undefined;

// Reuse one publisher-confirm channel; reset on disconnect so the next publish reconnects.
async function getPublisherChannel(): Promise<ConfirmChannel> {
  if (!channelPromise) {
    channelPromise = (async () => {
      const active = await amqp.connect(config.rabbitmqUrl);
      connection = active;
      active.on("error", (error) => logger("error", "RabbitMQ connection error:", error));
      active.on("close", () => {
        if (connection === active) {
          connection = undefined;
          channelPromise = undefined;
        }
      });
      try {
        const channel = await active.createConfirmChannel();
        await channel.assertQueue(config.notificationQueue, { durable: true });
        return channel;
      } catch (error) {
        connection = undefined;
        await active.close().catch(() => undefined);
        throw error;
      }
    })().catch((error: unknown) => {
      channelPromise = undefined;
      throw error;
    });
  }
  return channelPromise;
}

export interface AssessmentCompletedEvent {
  attemptId: string;
  user: { id: string; name: string; email: string };
  assessment: {
    roleTitle: string;
    levelLabel: string;
    overallScore: number;
    placement: "learning" | "internship" | "job";
    demonstratedLevel: string;
    summary: string;
    strengths: string[];
    gaps: string[];
    recommendedNext: string;
  };
}

// Queue the result email. The attempt id is the eventId, so notification-service de-duplicates retries.
// Never throws: a messaging outage must not lose or fail an already-saved result.
export async function publishAssessmentCompleted(event: AssessmentCompletedEvent): Promise<boolean> {
  try {
    const channel = await getPublisherChannel();
    const payload = {
      eventId: event.attemptId,
      eventType: "assessment.completed",
      occurredAt: new Date().toISOString(),
      user: event.user,
      assessment: {
        ...event.assessment,
        resultsUrl: new URL("/app/assessments", config.frontendUrl).toString(),
      },
    };
    channel.sendToQueue(config.notificationQueue, Buffer.from(JSON.stringify(payload)), {
      contentType: "application/json",
      persistent: true,
      messageId: event.attemptId,
      timestamp: Date.now(),
    });
    await channel.waitForConfirms();
    return true;
  } catch (error) {
    logger("error", "Failed to queue assessment result email:", error);
    return false;
  }
}

// Close publisher resources during graceful shutdown.
export async function closeNotificationPublisher(): Promise<void> {
  const pending = channelPromise;
  if (!pending) return;
  try {
    await (await pending).close();
  } catch (error) {
    logger("error", "Failed to close RabbitMQ channel:", error);
  } finally {
    await connection?.close().catch(() => undefined);
    connection = undefined;
    channelPromise = undefined;
  }
}
