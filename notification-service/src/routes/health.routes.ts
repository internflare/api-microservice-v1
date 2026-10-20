import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";

export const healthRoutes = Router();

// GET /health internally; the gateway exposes this as /api/v1/health.
healthRoutes.get("/", getHealth);
