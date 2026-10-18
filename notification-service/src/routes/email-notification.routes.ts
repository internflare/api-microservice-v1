import { Router } from "express";
import sendEmail from "../controllers/email-notification.controller.js";
import { requireApiKey } from "../middleware/api-key.middleware.js";

export const emailNotificationRoutes = Router();

// POST /api/v1/email-notification/email
emailNotificationRoutes.post("/email", requireApiKey, sendEmail);
