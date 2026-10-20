import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/appError.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  const safeError =
    error instanceof Error
      ? { name: error.name, message: error.message }
      : { message: "Unknown request failure" };
  if (response.headersSent) {
    console.error("[profile-service] Request failed:", safeError);
    next(error);
    return;
  }

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
    if (error.statusCode >= 500) {
      console.error("[profile-service] Request failed:", safeError);
    }
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error("[profile-service] Request failed:", safeError);
  response.status(500).json({ error: "Internal server error" });
};
