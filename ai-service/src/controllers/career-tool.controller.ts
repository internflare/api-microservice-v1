import type { RequestHandler } from "express";
import { runCareerTool } from "../services/career-tool.service.js";
import { formatValidationError } from "../validators/assessment.validator.js";
import {
  careerToolBodySchema,
  careerToolParamsSchema,
} from "../validators/career-tool.validator.js";

// POST /ai/career-tools/:toolId - generate output for one career tool from the caller's real data.
export const runCareerToolHandler: RequestHandler = async (req, res, next) => {
  const params = careerToolParamsSchema.safeParse(req.params);
  const body = careerToolBodySchema.safeParse(req.body ?? {});
  if (!params.success) {
    res.status(400).json({ error: "Unknown career tool", details: formatValidationError(params.error) });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: "Invalid request", details: formatValidationError(body.error) });
    return;
  }
  try {
    const text = await runCareerTool(req, params.data.toolId, body.data);
    res.status(200).json({ tool_id: params.data.toolId, text });
  } catch (error) {
    next(error);
  }
};
