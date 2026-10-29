import type { NextFunction } from "express";
import { AppError } from "./appError.js";
import { logger } from "./logger.js";

// Forward expected AppErrors untouched; log and mask anything unexpected behind a generic 500.
const forwardError = (
  error: unknown,
  next: NextFunction,
  logMessage: string,
  publicMessage: string,
): void => {
  if (error instanceof AppError) {
    next(error);
    return;
  }
  logger("error", logMessage, error);
  next(new AppError(publicMessage, 500));
};

export { forwardError };
