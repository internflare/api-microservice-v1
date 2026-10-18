import type { ErrorRequestHandler } from "express";
import { logger } from "../utils/logger.js";

// Centralize unexpected failures and keep internal provider details out of API responses.
export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  logger("error", "Request failed:", error);
  response.status(500).json({ error: "Internal server error" });
};
