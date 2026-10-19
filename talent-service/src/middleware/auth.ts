import type { RequestHandler } from "express";
import { config } from "../config.js";
import type { AuthenticatedUser } from "../types/express.d.js";

/**
 * Enforces that the request has an active, valid authentication session
 * by introspecting the session with auth-service (or mock headers in tests).
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    // If user is already attached (e.g. test mocks or upstream gateway enrichment)
    if (req.user) {
      next();
      return;
    }

    // In test environment, allow passing test user context via headers if provided
    if (process.env.NODE_ENV === "test" && req.headers["x-test-user-id"]) {
      req.user = {
        id: String(req.headers["x-test-user-id"]),
        email: String(req.headers["x-test-user-email"] || "test@internflare.com"),
        name: String(req.headers["x-test-user-name"] || "Test Talent"),
        role: String(req.headers["x-test-user-role"] || "TALENT"),
      };
      next();
      return;
    }

    // Reject immediately if neither session cookie nor authorization header is present
    if (!req.headers.cookie && !req.headers.authorization) {
      res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "Authentication is required to access this resource",
      });
      return;
    }

    // Remote session introspection with auth-service
    try {
      const authUrl = `${config.authServiceUrl}/api/auth/get-session`;
      const authRes = await fetch(authUrl, {
        headers: {
          ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
          ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
        },
      });

      if (!authRes.ok) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Authentication is required to access this resource",
        });
        return;
      }

      const session = (await authRes.json()) as { user?: AuthenticatedUser };
      if (!session || !session.user) {
        res.status(401).json({
          success: false,
          error: "Unauthorized",
          message: "Authentication is required to access this resource",
        });
        return;
      }

      req.user = session.user;
      next();
    } catch (fetchError) {
      console.error("[talent-service] Failed to reach auth-service:", fetchError);
      res.status(503).json({
        success: false,
        error: "Service Unavailable",
        message: "Authentication verification service temporarily unavailable",
      });
    }
  } catch (error) {
    next(error);
  }
};
