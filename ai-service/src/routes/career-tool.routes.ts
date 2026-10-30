import { Router } from "express";
import rateLimit from "express-rate-limit";
import { runCareerToolHandler } from "../controllers/career-tool.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const careerToolRoutes = Router();

// Each run calls OpenAI, so cap bursts per client.
const runLimiter = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});

careerToolRoutes.use(requireAuth);
careerToolRoutes.post("/:toolId", runLimiter, runCareerToolHandler);
