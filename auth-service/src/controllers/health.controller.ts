import type { RequestHandler } from "express";
import { checkDatabaseConnection } from "../models/health.model.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/appError.js";

// Reports healthy only when the service can also reach MongoDB.
export const getHealth: RequestHandler = async (_request, response) => {
  try {
    const checkDB: boolean = await checkDatabaseConnection();

    // If the database connection check fails, throw an error.
    if (!checkDB) throw new AppError("Database connection failed", 503);

    response.status(200).json({ status: "ok" });
  } catch (error) {
    logger("error", "Auth service health check failed:", error);
    throw new AppError("Auth service health check failed", 503);
  }
};
