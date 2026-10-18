import { Router } from "express";
import { healthHandler } from "../controllers/health.controller.js";

export const healthRoutes = Router();

healthRoutes.get("/", healthHandler);
