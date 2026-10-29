import type { RequestHandler } from "express";
import { listCompletedAttempts } from "../models/attempt.model.js";
import {
  getAttempt,
  getSuggestion,
  startAssessment,
  submitAssessment,
} from "../services/assessment.service.js";
import { AppError } from "../utils/appError.js";
import {
  formatValidationError,
  startAssessmentSchema,
  submitAssessmentSchema,
  uuidSchema,
} from "../validators/assessment.validator.js";

// requireAuth guarantees the user; this narrows the type and guards misuse.
const checkCurrentUser = (req: Parameters<RequestHandler>[0]) => {
  if (!req.user) throw new AppError("Authentication is required", 401);
  return req.user;
};

// GET /ai/assessments/suggestion - role and level inferred from the talent profile.
export const suggestAssessment: RequestHandler = async (req, res, next) => {
  try {
    checkCurrentUser(req);
    res.status(200).json(await getSuggestion(req));
  } catch (error) {
    next(error);
  }
};

// POST /ai/assessments - start an assessment and receive its questions.
export const createAssessment: RequestHandler = async (req, res, next) => {
  const parsed = startAssessmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res
      .status(400)
      .json({
        error: "Invalid request",
        details: formatValidationError(parsed.error),
      });
    return;
  }
  try {
    const user = checkCurrentUser(req);
    const result = await startAssessment(req, user, {
      roleId: parsed.data.role_id,
      level: parsed.data.level,
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// POST /ai/assessments/:id/submit - grade answers, place the talent and email the result.
export const submitAssessmentHandler: RequestHandler = async (
  req,
  res,
  next,
) => {
  const id = uuidSchema.safeParse(req.params.id);
  const body = submitAssessmentSchema.safeParse(req.body);
  if (!id.success || !body.success) {
    res.status(400).json({
      error: "Invalid request",
      details: body.success ? undefined : formatValidationError(body.error),
    });
    return;
  }
  try {
    const user = checkCurrentUser(req);
    const { metrics } = body.data;
    const result = await submitAssessment(user, id.data, body.data.responses, {
      goal: metrics.goal,
      confidence: metrics.confidence,
      weeklyHours: metrics.weekly_hours,
      hasShippedWork: metrics.has_shipped_work,
      portfolioUrl: metrics.portfolio_url,
    });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// GET /ai/assessments/:id - fetch one of the caller's assessments.
export const getAssessment: RequestHandler = async (req, res, next) => {
  const id = uuidSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid assessment id" });
    return;
  }
  try {
    res.status(200).json(await getAttempt(checkCurrentUser(req), id.data));
  } catch (error) {
    next(error);
  }
};

// GET /ai/assessments - the caller's completed assessments.
export const listAssessments: RequestHandler = async (req, res, next) => {
  try {
    res
      .status(200)
      .json({
        assessments: await listCompletedAttempts(checkCurrentUser(req).id),
      });
  } catch (error) {
    next(error);
  }
};
