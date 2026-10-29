import type { RequestHandler } from "express";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
  }
}

// Validate the caller's session with auth-service and attach the user to the request.
export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!req.headers.cookie && !req.headers.authorization) {
    res.status(401).json({ error: "Authentication is required" });
    return;
  }

  try {
    const response = await fetch(`${config.authServiceUrl}/api/auth/get-session`, {
      headers: {
        ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      res.status(401).json({ error: "Authentication is required" });
      return;
    }
    const session = (await response.json()) as { user?: AuthenticatedUser } | null;
    if (!session?.user?.id || !session.user.email) {
      res.status(401).json({ error: "Authentication is required" });
      return;
    }
    req.user = session.user;
    next();
  } catch (error) {
    logger("error", "Failed to reach auth-service:", error);
    res.status(503).json({ error: "Authentication service temporarily unavailable" });
  }
};
