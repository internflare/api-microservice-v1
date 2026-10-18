import type { RequestHandler } from "express";
import { checkDatabaseConnection } from "../models/health.model.js";
import { logger } from "../utils/logger.js";

// Reports healthy only when the service can also reach PostgreSQL.
export const getHealth: RequestHandler = async (_request, response) => {
  try {
    await checkDatabaseConnection();
    response.status(200).json({ status: "ok" });
  } catch (error) {
    logger("error", "Auth service health check failed:", error);
    response.status(503).json({ status: "unavailable" });
  }
};
