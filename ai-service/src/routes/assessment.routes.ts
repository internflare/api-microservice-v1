import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  createAssessment,
  getAssessment,
  listAssessments,
  submitAssessmentHandler,
  suggestAssessment,
} from "../controllers/assessment.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const assessmentRoutes = Router();

// Starting and submitting call OpenAI, so cap request bursts per client in addition to the daily limit.
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});

assessmentRoutes.use(requireAuth);
assessmentRoutes.get("/suggestion", suggestAssessment);
assessmentRoutes.get("/", listAssessments);
assessmentRoutes.post("/", aiLimiter, createAssessment);
assessmentRoutes.post("/:id/submit", aiLimiter, submitAssessmentHandler);
assessmentRoutes.get("/:id", getAssessment);
