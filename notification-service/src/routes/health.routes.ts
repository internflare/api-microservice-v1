import { Router } from "express";
import { getHealth } from "../controllers/health.controller.js";

export const healthRoutes = Router();

// GET /api/v1/health
healthRoutes.get("/", getHealth);
