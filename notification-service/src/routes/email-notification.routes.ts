import { Router } from "express";
import sendEmail from "../controllers/email-notification.controller.js";
import { requireApiKey } from "../middleware/api-key.middleware.js";

export const emailNotificationRoutes = Router();

// POST /notifications/email internally; the gateway exposes it under /api/v1.
emailNotificationRoutes.post("/email", requireApiKey, sendEmail);
