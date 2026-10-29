import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../utils/appError.js";
import { logger } from "../utils/logger.js";

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "Route not found" });
};

// Centralize failures; unexpected errors are logged and masked behind a generic 500.
export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (!(error instanceof AppError && error.statusCode < 500)) {
    logger("error", "Request failed:", error instanceof Error ? error.message : "Unknown failure");
  }
  if (response.headersSent) {
    next(error);
    return;
  }

  const errorType = typeof error === "object" && error !== null && "type" in error ? error.type : undefined;
  if (errorType === "entity.parse.failed") {
    response.status(400).json({ error: "Malformed JSON request body" });
    return;
  }
  if (errorType === "entity.too.large") {
    response.status(413).json({ error: "Request body is too large" });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  response.status(500).json({ error: "Internal server error" });
};
