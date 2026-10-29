import type { RequestHandler } from "express";
import * as Sentry from "@sentry/node";
import {
  formatValidationError,
  notificationSchema,
} from "../validators/email-notification.validator.js";
import { sendEmailNotification } from "../services/email-notification.service.js";
import { createNotification } from "../models/notification.model.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/appError.js";


// Validate request data before sending and persist the matching user notification.
const sendEmail: RequestHandler = async (request, response, next) => {
  const parsed = notificationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid notification payload",
      details: formatValidationError(parsed.error),
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
      next(
        new AppError(
          "Email was sent but notification could not be saved",
          500,
        ),
      );
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
    next(new AppError("Email provider failed to send notification", 502));
  }
};

export default sendEmail;
