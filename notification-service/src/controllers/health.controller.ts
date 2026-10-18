import type { RequestHandler } from "express";
import { checkDatabaseConnection } from "../models/notification.model.js";
import { logger } from "../utils/logger.js";

// Report healthy only when the notification database is reachable.
export const getHealth: RequestHandler = async (_request, response) => {
  try {
    await checkDatabaseConnection();
    response.status(200).json({ status: "ok" });
  } catch (error) {
    logger("error", "Notification service health check failed:", error);
    response.status(503).json({ status: "unavailable" });
  }
};
