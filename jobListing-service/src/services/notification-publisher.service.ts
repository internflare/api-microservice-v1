import amqp, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { OpportunityRecord } from "../models/opportunity.model.js";
import { logger } from "../utils/logger.js";

export interface NotificationRecipient {
  email: string;
  name?: string;
}

// Event structure for a job published notification
export interface JobPublishedEvent {
  eventId: string;
  eventType: "job.published";
  occurredAt: string;
  opportunity: Pick<
    OpportunityRecord,
    | "id"
    | "company_id"
    | "title"
    | "description"
    | "location"
    | "work_arrangement"
    | "application_deadline"
  >;
  recipients: NotificationRecipient[];
}

export interface JobApplicationSubmittedEvent {
  eventId: string;
  eventType: "job.application_submitted";
  occurredAt: string;
  application: {
    id?: string;
    opportunityId: string;
    opportunityTitle: string;
    applicantName: string;
    applicantEmail: string;
    coverLetterExcerpt?: string;
  };
  recipient: NotificationRecipient;
}

export interface InterviewNoticeEvent {
  eventId: string;
  eventType: "job.interview_notice";
  occurredAt: string;
  notice: {
    kind: InterviewNoticeKind;
    interviewId: string;
    applicationId: string;
    opportunityTitle: string;
    companyName: string;
    otherPartyName: string;
    scheduledAt: string;
    format: string;
    meetingUrl?: string;
    message?: string;
    audience: "talent" | "employer";
  };
  recipient: NotificationRecipient;
}

export type InterviewNoticeKind =
  | "requested"
  | "rescheduled"
  | "cancelled"
  | "confirmed"
  | "declined"
  | "reschedule_requested";

let connection: ChannelModel | undefined;
let channelPromise: Promise<ConfirmChannel> | undefined;

// Get or create a publisher channel for sending notifications to RabbitMQ
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
          "RabbitMQ connection closed; publisher will reconnect on demand",
        );
      });

      try {
        const channel = await activeConnection.createConfirmChannel();
        await channel.assertQueue(config.notificationQueue, { durable: true });
        logger(
          "info",
          `Connected to notification queue ${config.notificationQueue}`,
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
      throw error;
    });
  }
  return channelPromise;
}

// Establish a connection to RabbitMQ and create a channel for publishing notifications
async function connectNotificationPublisher(): Promise<void> {
  await getPublisherChannel();
}

// Send an event to the durable queue and wait for the broker to confirm it was stored.
async function publish(
  event: JobPublishedEvent | JobApplicationSubmittedEvent | InterviewNoticeEvent,
) {
  const channel = await getPublisherChannel();
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
  logger("info", `Queued ${event.eventType} notification ${event.eventId}`);
}

// Notify the company of a new job posting
async function publishJobCreated(
  opportunity: OpportunityRecord,
  recipients: NotificationRecipient[],
): Promise<void> {
  const event: JobPublishedEvent = {
    eventId: randomUUID(),
    eventType: "job.published",
    occurredAt: new Date().toISOString(),
    opportunity: {
      id: opportunity.id,
      company_id: opportunity.company_id,
      title: opportunity.title,
      description: opportunity.description,
      location: opportunity.location,
      work_arrangement: opportunity.work_arrangement,
      application_deadline: opportunity.application_deadline,
    },
    recipients,
  };
  await publish(event);
}

// Notify the company of a new application for an opportunity
async function publishJobApplication(
  opportunity: OpportunityRecord,
  applicant: { name: string; email: string },
  recipient: NotificationRecipient,
  details: { applicationId?: string; coverLetter?: string | null } = {},
): Promise<void> {
  const event: JobApplicationSubmittedEvent = {
    eventId: randomUUID(),
    eventType: "job.application_submitted",
    occurredAt: new Date().toISOString(),
    application: {
      id: details.applicationId,
      opportunityId: opportunity.id,
      opportunityTitle: opportunity.title,
      applicantName: applicant.name,
      applicantEmail: applicant.email,
      coverLetterExcerpt: details.coverLetter?.trim().slice(0, 400) || undefined,
    },
    recipient,
  };
  await publish(event);
}

// Tell the talent (or the hiring team) about an interview change
async function publishInterviewNotice(
  notice: InterviewNoticeEvent["notice"],
  recipient: NotificationRecipient,
): Promise<void> {
  await publish({
    eventId: randomUUID(),
    eventType: "job.interview_notice",
    occurredAt: new Date().toISOString(),
    notice,
    recipient,
  });
}

// Close the publisher channel and connection when the service is shutting down
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

export {
  connectNotificationPublisher,
  publishJobCreated,
  closeNotificationPublisher,
  publishJobApplication,
  publishInterviewNotice,
};
