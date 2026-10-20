import type { ErrorRequestHandler } from "express";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/appError.js";

// Centralize unexpected failures and keep internal provider details out of API responses.
export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  // Avoid logging parser error objects, which may include the rejected request body.
  const safeError =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { message: "Unknown request failure" };
  if (!(error instanceof AppError && error.statusCode < 500)) {
    logger("error", "Request failed:", safeError);
  }

  if (response.headersSent) {
    next(error);
    return;
  }

  // Expose safe, known body-parser errors as client errors without leaking parser internals.
  const errorType =
    typeof error === "object" && error !== null && "type" in error
      ? error.type
      : undefined;
  if (errorType === "entity.parse.failed") {
    response.status(400).json({ error: "Malformed JSON request body" });
    return;
  }
  if (errorType === "entity.too.large") {
    response.status(413).json({ error: "Request body is too large" });
    return;
  }

  if (error instanceof AppError && error.isOperational) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  response.status(500).json({ error: "Internal server error" });
};
