import { z } from "zod";
import { notificationTypes } from "../services/email-notification.service.js";

// Call-to-action button shown in the email; only http(s) links are allowed.
export const actionSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.url().refine((url) => /^https?:\/\//i.test(url), {
    message: "Action URL must use HTTP or HTTPS",
  }),
});

// Payload accepted by the send-email endpoint.
export const notificationSchema = z.object({
  type: z.enum(notificationTypes),
  user_id: z.string().trim().regex(/^[a-f\d]{24}$/i, "user_id must be a valid ObjectId"),
  to: z.email(),
  recipientName: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10_000),
  action: actionSchema.optional(),
});

// Flatten a zod error into the response shape used by the API.
export const formatValidationError = (error: z.ZodError) =>
  z.flattenError(error);
