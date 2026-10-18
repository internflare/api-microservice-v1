import type { RequestHandler } from "express";
import { findSession } from "../models/session.model.js";
import type { AuthenticatedUser } from "../types/express.d.js";

// Enforces that the request has an active, valid authentication session.
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    // In test environment, allow passing test user context via headers if provided
    if (process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]) {
      req.user = {
        id: String(req.headers["x-test-user-id"]),
        email: String(req.headers["x-test-user-email"] || "test@internflare.com"),
        name: String(req.headers["x-test-user-name"] || "Test User"),
        role: String(req.headers["x-test-user-role"] || "USER"),
      };
      next();
      return;
    }

    // Fast-path: reject immediately if neither session cookie nor authorization header is present
    if (!req.headers.cookie && !req.headers.authorization) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication is required to access this resource",
      });
      return;
    }

    const session = await findSession(req.headers);

    if (!session || !session.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication is required to access this resource",
      });
      return;
    }

    req.user = session.user as AuthenticatedUser;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Enforces that the authenticated user possesses platform administrator privileges.
 */
export const requirePlatformAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Authentication is required to access this resource",
    });
    return;
  }

  const role = req.user.role?.toUpperCase();
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    res.status(403).json({
      error: "Forbidden",
      message: "Platform administrator access required",
    });
    return;
  }

  next();
};
