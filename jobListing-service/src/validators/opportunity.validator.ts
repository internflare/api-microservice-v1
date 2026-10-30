import type { Request } from "express";
import { z } from "zod";
import { AppError } from "../utils/appError.js";
import { CAREER_ROLE_IDS } from "../constants/career-roles.js";

// MongoDB ObjectId (24 hex chars): the id format for companies and opportunities.
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Must be a valid id");

const recipientSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120).optional(),
});

const nullableText = (maximum = 5000) =>
  z.string().trim().max(maximum).nullable().optional();
const nullableMoney = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .transform(String)
  .nullable()
  .optional();
const todayStart = () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
};
const isOnOrAfterToday = (value: string): boolean =>
  new Date(value) >= todayStart();

// Fields shared by the create and update payloads.
const opportunityFields = {
  external_apply_url: z.url().nullable().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(50_000),
  responsibilities: nullableText(50_000),
  role_id: z.enum(CAREER_ROLE_IDS).nullable().optional(),
  opportunity_type: z.string().trim().min(1).max(100),
  employment_type: nullableText(100),
  experience_level: nullableText(100),
  is_paid: z.boolean(),
  compensation_min: nullableMoney,
  compensation_max: nullableMoney,
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  payment_frequency: z
    .enum(["hour", "day", "week", "month", "year", "project"])
    .nullable()
    .optional(),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  location: nullableText(255),
  work_arrangement: z.string().trim().min(1).max(100),
  skills_required: z
    .array(z.string().trim().min(1).max(100))
    .max(100)
    .optional(),
  duration_weeks: z.number().int().positive().max(520).nullable().optional(),
  start_date: z.iso
    .date()
    .refine(isOnOrAfterToday, { message: "start_date cannot be before today" })
    .nullable()
    .optional(),
  application_deadline: z.iso
    .datetime()
    .refine(isOnOrAfterToday, {
      message: "application_deadline cannot be before today",
    })
    .transform((value) => new Date(value))
    .nullable()
    .optional(),
  openings: z.number().int().positive().max(1_000_000).nullable().optional(),
  status: z.enum(["published", "paused", "closed"]).optional(),
};

// Shared rule: when both bounds are set, the minimum must not exceed the maximum.
// Values arrive as strings after the money transform, so compare numerically.
const compensationRangeRule = {
  check: (data: {
    compensation_min?: string | null;
    compensation_max?: string | null;
  }) =>
    data.compensation_min == null ||
    data.compensation_max == null ||
    Number(data.compensation_min) <= Number(data.compensation_max),
  options: {
    message: "compensation_min cannot exceed compensation_max",
    path: ["compensation_max"],
  },
};

const createFields = {
  company_id: objectIdSchema,
  source_type: z.string().trim().min(1).max(100).default("employer"),
  ...opportunityFields,
};

// Drafts are stored in Redis only and carry the same fields as a listing (minus status).
const draftSchema = z
  .object(createFields)
  .omit({ status: true })
  .strict()
  .refine(compensationRangeRule.check, compensationRangeRule.options);

const createOpportunitySchema = z
  .object({
    ...createFields,
    follower_recipients: z.array(recipientSchema).max(10_000).optional(),
    // When publishing from a saved draft, the draft is removed once the listing exists.
    draft_id: objectIdSchema.optional(),
  })
  .strict()
  .refine(compensationRangeRule.check, compensationRangeRule.options);

const updateOpportunitySchema = z
  .object(opportunityFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one editable field is required",
  })
  .refine(compensationRangeRule.check, compensationRangeRule.options);

const applicationSchema = z.object({
  applicant_name: z.string().trim().min(1).max(120),
  applicant_email: z.email(),
  // Placeholder until company records can provide the hiring contact email.
  company_email: z.email(),
  company_contact_name: z.string().trim().min(1).max(120).optional(),
});

// Shared page/page_size query pagination.
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

// Pagination for the company management listing.
const companyListPaginationSchema = paginationSchema;

// Convert a Zod error into the field-level details returned in 400 responses.
const formatValidationError = (error: z.ZodError) => z.flattenError(error);

// Resolve the company for management listings. A JSON body is honoured for API clients;
// browsers cannot send GET bodies, so `company_id` + `scope=company` in the query is also accepted.
const resolveManagedCompanyId = (request: Request): unknown => {
  const bodyCompanyId = (request.body as { company_id?: unknown } | undefined)
    ?.company_id;
  if (bodyCompanyId !== undefined) return bodyCompanyId;
  return request.query.scope === "company"
    ? request.query.company_id
    : undefined;
};

// Return the authenticated user's id or fail with 401.
const requireUserId = (request: Request): string => {
  if (!request.user?.id) {
    throw new AppError("Authentication is required", 401);
  }
  return request.user.id;
};

export {
  applicationSchema,
  companyListPaginationSchema,
  createOpportunitySchema,
  draftSchema,
  formatValidationError,
  objectIdSchema,
  paginationSchema,
  requireUserId,
  resolveManagedCompanyId,
  updateOpportunitySchema,
};
