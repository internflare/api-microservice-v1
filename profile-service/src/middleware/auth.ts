import type { RequestHandler } from "express";
import { config } from "../config.js";
import type { AuthenticatedUser } from "../types/express.js";

/**
 * Enforces that the request has an active, valid authentication session
 * by introspecting the session with auth-service (or mock headers in tests).
 */
const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    // If user is already attached (e.g., test mocks or upstream gateway enrichment)
    if (req.user) {
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
          ...(req.headers.authorization
            ? { authorization: req.headers.authorization }
            : {}),
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
      console.error(
        "[profile-service] Failed to reach auth-service:",
        fetchError,
      );
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

/**
 * Enforces that the authenticated user possesses platform administrator privileges.
 */
const requirePlatformAdmin: RequestHandler = (req, res, next) => {
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

/**
 * Attaches the user when a valid session exists but never rejects; anonymous visitors continue.
 */
const optionalAuth: RequestHandler = async (req, _res, next) => {
  if (req.user || (!req.headers.cookie && !req.headers.authorization)) {
    next();
    return;
  }
  try {
    const authRes = await fetch(`${config.authServiceUrl}/api/auth/get-session`, {
      headers: {
        ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
      },
    });
    if (authRes.ok) {
      const session = (await authRes.json()) as { user?: AuthenticatedUser } | null;
      if (session?.user) req.user = session.user;
    }
  } catch (error) {
    console.warn("[profile-service] Optional auth lookup failed; treating as anonymous:", error);
  }
  next();
};

export { requirePlatformAdmin, requireAuth, optionalAuth };
