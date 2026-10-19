import type { RequestHandler } from "express";
import { config } from "../config.js";

/**
 * Validates internal microservice requests via shared secret header (x-internal-service-key).
 * Protects cross-service RPC and data inspection routes from unauthorized external access.
 */
export const requireInternalServiceAuth: RequestHandler = (req, res, next) => {
  const providedKey = req.headers["x-internal-service-key"];

  if (!providedKey || typeof providedKey !== "string") {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing x-internal-service-key header for internal service endpoint",
    });
    return;
  }

  if (providedKey !== config.internalServiceSecret) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Invalid internal service credentials",
    });
    return;
  }

  next();
};
