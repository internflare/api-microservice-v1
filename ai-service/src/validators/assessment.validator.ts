import { z } from "zod";

export const uuidSchema = z.uuid();

const roleIds = [
  "frontend-developer",
  "backend-engineer",
  "data-analyst",
  "product-designer",
  "growth-marketer",
  "support-engineer",
  "virtual-assistant",
  "programme-assistant",
] as const;

export const startAssessmentSchema = z
  .object({
    role_id: z.enum(roleIds).optional(),
    level: z.enum(["intern", "junior", "mid", "senior"]).optional(),
  })
  .strict();

const responseSchema = z
  .object({
    choice: z.number().int().min(0).max(10).optional(),
    text: z.string().max(10_000).optional(),
    code: z.string().max(20_000).optional(),
  })
  .strict();

// Metrics gathered after the test to decide where the talent fits.
export const metricsSchema = z
  .object({
    goal: z.enum(["internship", "job", "exploring"]),
    confidence: z.number().int().min(1).max(5),
    weekly_hours: z.number().int().min(0).max(80),
    has_shipped_work: z.boolean(),
    portfolio_url: z
      .url()
      .refine((url) => /^https?:\/\//i.test(url), { message: "portfolio_url must use HTTP or HTTPS" })
      .optional(),
  })
  .strict();

export const submitAssessmentSchema = z
  .object({
    responses: z.record(z.uuid(), responseSchema),
    metrics: metricsSchema,
  })
  .strict();

// Flatten a zod error into the API's response shape.
export const formatValidationError = (error: z.ZodError) => z.flattenError(error);
