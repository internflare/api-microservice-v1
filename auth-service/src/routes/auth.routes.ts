import { Router } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "../auth.js";

export const authRoutes = Router();

// Register at the app root so Express does not strip Better Auth's /api/auth base path.
// Better Auth must receive the untouched request body before JSON parsing.
authRoutes.all("/api/auth/*splat", toNodeHandler(auth));
