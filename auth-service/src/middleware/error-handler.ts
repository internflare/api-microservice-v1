import type { ErrorRequestHandler } from "express";
import { logger } from "../utils/logger.js";

// Centralizes unexpected route failures without returning internal error details.
export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  logger("error", "Request failed:", error);
  response.status(500).json({ error: "Internal server error" });
};
