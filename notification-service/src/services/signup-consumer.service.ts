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

const emailVerificationEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("user.email_verification_requested"),
  occurredAt: z.iso.datetime(),
  user: signupEventSchema.shape.user,
  verificationUrl: z.url().refine(
    (url) => {
      const protocol = new URL(url).protocol;
      return protocol === "http:" || protocol === "https:";
    },
    { message: "Verification URL must use HTTP or HTTPS" },
  ),
});

const passwordResetEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("user.password_reset_requested"),
  occurredAt: z.iso.datetime(),
  user: signupEventSchema.shape.user,
  resetUrl: emailVerificationEventSchema.shape.verificationUrl,
});

const passwordChangedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("user.password_changed"),
  occurredAt: z.iso.datetime(),
  user: signupEventSchema.shape.user,
});

const recipientSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120).optional(),
});

const jobPublishedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("job.published"),
  occurredAt: z.iso.datetime(),
  opportunity: z.object({
    id: z.string().min(1),
    company_id: z.string().min(1).nullable(),
    title: z.string().min(1),
    description: z.string().min(1),
    location: z.string().nullable(),
    work_arrangement: z.string().min(1),
    application_deadline: z.iso.datetime().nullable(),
  }),
  recipients: z.array(recipientSchema),
});

const jobApplicationEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("job.application_submitted"),
  occurredAt: z.iso.datetime(),
  application: z.object({
    opportunityId: z.string().min(1),
    opportunityTitle: z.string().min(1),
    applicantName: z.string().min(1),
    applicantEmail: z.email(),
  }),
  recipient: recipientSchema,
});

const assessmentCompletedEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("assessment.completed"),
  occurredAt: z.iso.datetime(),
  user: z.object({
    id: z.string().min(1),
    name: z.string().max(120).optional(),
    email: z.email(),
  }),
  assessment: z.object({
    roleTitle: z.string().min(1),
    levelLabel: z.string().min(1),
    overallScore: z.number().min(0).max(100),
    placement: z.enum(["learning", "internship", "job"]),
    demonstratedLevel: z.string().min(1),
    summary: z.string(),
    strengths: z.array(z.string()),
    gaps: z.array(z.string()),
    recommendedNext: z.string(),
    resultsUrl: z.url(),
  }),
});

type ConsumerSession = {
  connection: ChannelModel;
  channel: Channel;
  closed: Promise<void>;
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isTransientRabbitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
  ].includes(String(error.code));
}

async function createConsumerSession(
  onMessage: (message: amqp.ConsumeMessage | null, channel: Channel) => void,
): Promise<ConsumerSession> {
  const connection = await amqp.connect(config.rabbitmqUrl);
  connection.on("error", (error) =>
    logger("error", "RabbitMQ notification connection error:", error),
  );
  const closed = new Promise<void>((resolve) => {
    connection.once("close", resolve);
  });

  try {
    const channel = await connection.createChannel();
    channel.on("error", (error) =>
      logger("error", "RabbitMQ notification consumer channel error:", error),
    );
    await channel.assertQueue(config.notificationQueue, { durable: true });
    await channel.prefetch(1);
    await channel.consume(
      config.notificationQueue,
      (message) => onMessage(message, channel),
      { noAck: false },
    );

    return { connection, channel, closed };
  } catch (error) {
    try {
      await connection.close();
    } catch (closeError) {
      logger(
        "warn",
        "Failed to close RabbitMQ after consumer setup failed:",
        closeError,
      );
    }
    throw error;
  }
}

async function deliverSignupEvent(
  event: z.infer<typeof signupEventSchema>,
): Promise<void> {
  const notificationId = `welcome:${event.user.id}`;
  if (await findNotificationById(notificationId)) {
    logger("info", `Welcome notification for user ${event.user.id} was already saved`);
    return;
  }

  const title = "Welcome to Internflare";
  const body =
    "Your account has been created successfully. Explore opportunities, build your profile, and take the next step in your career.";
  const link = new URL("/app", config.frontendUrl).toString();

  await sendEmailNotification({
    type: "account",
    to: event.user.email,
    recipientName: event.user.name || undefined,
    subject: title,
    message: body,
    action: { label: "Open your dashboard", url: link },
  });
  await createNotification({
    id: notificationId,
    user_id: event.user.id,
    type: "account",
    title,
    body,
    link,
    channel: "email",
    dedupe_key: "welcome",
  });
}

async function deliverEmailVerificationEvent(
  event: z.infer<typeof emailVerificationEventSchema>,
): Promise<void> {
  await sendEmailNotification({
    type: "account",
    to: event.user.email,
    recipientName: event.user.name || undefined,
    subject: "Verify your Internflare email address",
    message:
      "Thanks for creating an Internflare account. Verify your email address to secure your account and continue.",
    action: {
      label: "Verify email address",
      url: event.verificationUrl,
    },
  });
}

async function deliverPasswordResetEvent(
  event: z.infer<typeof passwordResetEventSchema>,
): Promise<void> {
  await sendEmailNotification({
    type: "account",
    to: event.user.email,
    recipientName: event.user.name || undefined,
    subject: "Reset your Internflare password",
    message:
      "We received a request to reset your Internflare password. This link expires in 30 minutes. If you didn't request it, you can safely ignore this email.",
    action: { label: "Reset password", url: event.resetUrl },
  });
}

async function deliverPasswordChangedEvent(
  event: z.infer<typeof passwordChangedEventSchema>,
): Promise<void> {
  const link = new URL("/sign-in", config.frontendUrl).toString();
  await sendEmailNotification({
    type: "account",
    to: event.user.email,
    recipientName: event.user.name || undefined,
    subject: "Your Internflare password was changed",
    message:
      "Your Internflare password was just changed. If this was you, no further action is needed and you are now signed in. If you did not make this change, reset your password immediately and contact support.",
    action: { label: "Sign in", url: link },
  });
  await createNotification({
    id: event.eventId,
    user_id: event.user.id,
    type: "account",
    title: "Password changed",
    body: "Your Internflare password was just changed. If this was not you, reset it immediately.",
    link,
    channel: "email",
  });
}

async function deliverJobPublishedEvent(
  event: z.infer<typeof jobPublishedEventSchema>,
): Promise<void> {
  const link = new URL(
    `/app/opportunities/${event.opportunity.id}`,
    config.frontendUrl,
  ).toString();

  for (const recipient of event.recipients) {
    await sendEmailNotification({
      type: "system",
      to: recipient.email,
      recipientName: recipient.name,
      subject: `New opportunity: ${event.opportunity.title}`,
      message: [
        event.opportunity.description,
        event.opportunity.location
          ? `Location: ${event.opportunity.location}`
          : undefined,
        `Work arrangement: ${event.opportunity.work_arrangement}`,
        event.opportunity.application_deadline
          ? `Application deadline: ${event.opportunity.application_deadline}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n\n"),
      action: { label: "View opportunity", url: link },
    });
  }
}

async function deliverJobApplicationEvent(
  event: z.infer<typeof jobApplicationEventSchema>,
): Promise<void> {
  const link = new URL(
    `/app/opportunities/${event.application.opportunityId}`,
    config.frontendUrl,
  ).toString();

  await sendEmailNotification({
    type: "application",
    to: event.recipient.email,
    recipientName: event.recipient.name,
    subject: `New application: ${event.application.opportunityTitle}`,
    message: `${event.application.applicantName} (${event.application.applicantEmail}) applied for ${event.application.opportunityTitle}.`,
    action: { label: "View opportunity", url: link },
  });
}

const placementLabels = {
  learning: "Learning pool",
  internship: "Internship pool",
  job: "Job pool",
} as const;

// Email the talent their assessment result; deduplicated by eventId (the attempt id).
async function deliverAssessmentCompletedEvent(
  event: z.infer<typeof assessmentCompletedEventSchema>,
): Promise<void> {
  if (await findNotificationById(event.eventId)) {
    logger("info", `Assessment notification ${event.eventId} was already saved`);
    return;
  }

  const { assessment } = event;
  const title = `Your ${assessment.roleTitle} assessment result`;
  const list = (items: string[]) =>
    items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None identified";
  const body = [
    `Overall score: ${assessment.overallScore}/100`,
    `Placement: ${placementLabels[assessment.placement]}`,
    `Demonstrated level: ${assessment.demonstratedLevel} (tested at ${assessment.levelLabel})`,
    assessment.summary,
    `Strengths:\n${list(assessment.strengths)}`,
    `Areas to improve:\n${list(assessment.gaps)}`,
    `Recommended next step: ${assessment.recommendedNext}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  await sendEmailNotification({
    type: "system",
    to: event.user.email,
    recipientName: event.user.name || undefined,
    subject: title,
    message: body,
    action: { label: "View your results", url: assessment.resultsUrl },
  });
  await createNotification({
    id: event.eventId,
    user_id: event.user.id,
    type: "system",
    title,
    body,
    link: assessment.resultsUrl,
    channel: "email",
  });
}

const teamInviteEventSchema = z.object({
  eventId: z.uuid(),
  eventType: z.literal("company.team_invite"),
  occurredAt: z.iso.datetime(),
  invite: z.object({
    email: z.email(),
    token: z.string().min(20),
    companyName: z.string().min(1).max(255),
    inviterName: z.string().max(120),
    role: z.enum(["ADMIN", "MEMBER"]),
    expiresAt: z.iso.datetime(),
  }),
});

// Email a teammate a link to a minimal signup page that attaches them to the company.
async function deliverTeamInviteEvent(
  event: z.infer<typeof teamInviteEventSchema>,
): Promise<void> {
  const { invite } = event;
  const link = new URL("/join-team", config.frontendUrl);
  link.searchParams.set("token", invite.token);
  const expires = new Date(invite.expiresAt).toUTCString();

  await sendEmailNotification({
    type: "account",
    to: invite.email,
    subject: `${invite.inviterName || "A teammate"} invited you to join ${invite.companyName} on Internflare`,
    message: `${invite.inviterName || "A teammate"} has invited you to join ${invite.companyName}'s hiring team on Internflare. Set up your account with just your name and a password — the company is already configured. This link expires on ${expires}.`,
    action: { label: "Accept invitation", url: link.toString() },
  });
}

// Registry mapping each eventType to its validation schema and delivery function.
// Adding a new event type only requires one entry here.
const eventHandlers: Record<
  string,
  { schema: z.ZodType; deliver: (event: never) => Promise<void> }
> = {
  "user.signed_up": {
    schema: signupEventSchema,
    deliver: deliverSignupEvent,
  },
  "user.email_verification_requested": {
    schema: emailVerificationEventSchema,
    deliver: deliverEmailVerificationEvent,
  },
  "user.password_reset_requested": {
    schema: passwordResetEventSchema,
    deliver: deliverPasswordResetEvent,
  },
  "user.password_changed": {
    schema: passwordChangedEventSchema,
    deliver: deliverPasswordChangedEvent,
  },
  "job.published": {
    schema: jobPublishedEventSchema,
    deliver: deliverJobPublishedEvent,
  },
  "job.application_submitted": {
    schema: jobApplicationEventSchema,
    deliver: deliverJobApplicationEvent,
  },
  "assessment.completed": {
    schema: assessmentCompletedEventSchema,
    deliver: deliverAssessmentCompletedEvent,
  },
  "company.team_invite": {
    schema: teamInviteEventSchema,
    deliver: deliverTeamInviteEvent,
  },
};

// Route all events from the shared queue by eventType; unknown or malformed events are discarded.
async function deliverNotification(
  message: amqp.ConsumeMessage | null,
  channel: Channel,
): Promise<void> {
  if (!message) return;

  let decoded: unknown;
  try {
    decoded = JSON.parse(message.content.toString("utf8"));
  } catch (error) {
    logger("error", "Discarding malformed notification JSON:", error);
    channel.ack(message);
    return;
  }

  const eventType =
    typeof decoded === "object" && decoded !== null && "eventType" in decoded
      ? decoded.eventType
      : undefined;
  try {
    const handler =
      typeof eventType === "string" ? eventHandlers[eventType] : undefined;
    if (!handler) {
      logger("error", `Discarding unknown notification event type: ${String(eventType)}`);
      channel.ack(message);
      return;
    }

    // A schema failure is permanent, so ack (discard) instead of requeueing forever.
    const parsed = handler.schema.safeParse(decoded);
    if (!parsed.success) {
      logger("error", `Discarding invalid ${String(eventType)} event:`, parsed.error);
      channel.ack(message);
      return;
    }
    await (handler.deliver as (event: unknown) => Promise<void>)(parsed.data);

    channel.ack(message);
    logger("info", `Delivered ${String(eventType)} notification`);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { operation: "deliver-notification-event", eventType: String(eventType) },
    });
    logger("error", `Notification delivery failed for ${String(eventType)}:`, error);
    await wait(1_000);
    channel.nack(message, false, true);
  }
}

// Maintain a single queue consumer and reconnect after RabbitMQ restarts.
async function startSignupNotificationConsumer(): Promise<
  () => Promise<void>
> {
  let stopping = false;
  let session: ConsumerSession | undefined;

  const processMessages = (
    message: amqp.ConsumeMessage | null,
    channel: Channel,
  ) => {
    void deliverNotification(message, channel).catch((error: unknown) => {
      logger("error", "Unexpected notification consumer failure:", error);
      Sentry.captureException(error, {
        tags: { operation: "process-notification-message" },
      });
      if (message) {
        try {
          channel.nack(message, false, true);
        } catch (acknowledgementError) {
          logger(
            "error",
            "Failed to requeue notification after consumer failure:",
            acknowledgementError,
          );
        }
      }
    });
  };

  // RabbitMQ may pass its container health check before the AMQP listener is ready.
  while (!stopping && !session) {
    try {
      session = await createConsumerSession(processMessages);
    } catch (error) {
      if (!isTransientRabbitError(error)) throw error;
      logger(
        "warn",
        "RabbitMQ is not ready; retrying the notification consumer in 3 seconds:",
        error,
      );
      await wait(3_000);
    }
  }

  if (!session) {
    throw new Error("Notification consumer stopped before RabbitMQ connected");
  }

  const reconnectTask = (async () => {
    let activeSession: ConsumerSession | undefined = session;
    while (!stopping) {
      if (activeSession) {
        await activeSession.closed;
        if (stopping) break;

        logger("warn", "RabbitMQ notification connection closed; reconnecting in 3 seconds");
        try {
          await activeSession.connection.close();
        } catch (error) {
          logger("warn", "RabbitMQ connection was already closed:", error);
        }
        activeSession = undefined;
        session = undefined;
      }

      await wait(3_000);
      while (!stopping && !activeSession) {
        try {
          activeSession = await createConsumerSession(processMessages);
          session = activeSession;
          logger("info", "Reconnected notification consumer to RabbitMQ");
        } catch (error) {
          logger("error", "RabbitMQ notification consumer reconnect failed:", error);
          await wait(3_000);
        }
      }
    }
  })();
  void reconnectTask.catch((error: unknown) => {
    logger("error", "Notification consumer stopped unexpectedly:", error);
  });

  return async () => {
    stopping = true;
    if (session) {
      try {
        await session.connection.close();
      } catch (error) {
        logger("warn", "Notification consumer connection was already closed:", error);
      }
    }
    await reconnectTask;
    session = undefined;
  };
}

export { startSignupNotificationConsumer };
