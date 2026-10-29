import { Router } from "express";
import { toNodeHandler } from "better-auth/node";
import { getAuth } from "../auth.js";

// Register at the app root so Express does not strip Better Auth's /api/auth base path.
// Better Auth must receive the untouched request body before JSON parsing.
export function createAuthRoutes() {
  const authRoutes = Router();
  authRoutes.all("/api/auth/*splat", toNodeHandler(getAuth()));
  return authRoutes;
}
