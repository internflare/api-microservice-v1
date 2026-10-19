import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";

export const healthRoutes = Router();

// Register at the app root so Express does not strip Better Auth's /api/health base path.
healthRoutes.get("/", getHealth);
