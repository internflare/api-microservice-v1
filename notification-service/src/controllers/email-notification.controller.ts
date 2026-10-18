import type { RequestHandler } from "express";
import * as Sentry from "@sentry/node";
import { z } from "zod";
import {
  notificationTypes,
  sendEmailNotification,
} from "../services/email-notification.service.js";
import { createNotification } from "../models/notification.model.js";
import { logger } from "../utils/logger.js";

const actionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.url().refine((url) => /^https?:\/\//i.test(url), {
    message: "Action URL must use HTTP or HTTPS",
  }),
});

const notificationSchema = z.object({
  type: z.enum(notificationTypes),
  user_id: z.string().trim().min(1).max(255),
  to: z.email(),
  recipientName: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10_000),
  action: actionSchema.optional(),
});

// Validate request data before sending and persist the matching user notification.
const sendEmail: RequestHandler = async (request, response) => {
  const parsed = notificationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid notification payload",
      details: z.flattenError(parsed.error),
    });
    return;
  }

  const { user_id, type, subject, message, action } = parsed.data;
  try {
    const email = await sendEmailNotification(parsed.data);
    let notification;
    try {
      notification = await createNotification({
        user_id,
        type,
        title: subject,
        body: message,
        link: action?.url ?? null,
        channel: "email",
      });
    } catch (error) {
      Sentry.captureException(error, {
        tags: { operation: "persist-email-notification" },
      });
      logger("error", "Email was sent but notification persistence failed:", error);
      response
        .status(500)
        .json({ error: "Email was sent but notification could not be saved" });
      return;
    }
    response.status(202).json({
      status: "accepted",
      email_id: email.id,
      notification,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { operation: "send-email-notification" },
    });
    logger("error", "Email delivery failed:", error);
    response
      .status(502)
      .json({ error: "Email provider failed to send notification" });
  }
};

export default sendEmail;
