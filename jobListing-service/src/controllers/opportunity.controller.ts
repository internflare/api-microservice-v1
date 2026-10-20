import type { RequestHandler } from "express";
import { z } from "zod";
import {
  createOpportunity,
  getOpportunityById,
  listOpportunities,
  type OpportunityRecord,
} from "../models/opportunity.model.js";
import { OpportunityQuery } from "../models/opportunity-query.js";
import {
  publishJobApplication,
  publishJobCreated,
} from "../services/notification-publisher.service.js";
import { AppError } from "../utils/appError.js";
import { logger } from "../utils/logger.js";

const recipientSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(120).optional(),
});

const nullableText = (maximum = 5000) =>
  z.string().trim().max(maximum).nullable().optional();
const nullableUuid = z.uuid().nullable().optional();
const nullableMoney = z
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .nullable()
  .optional();

// Notification recipients are a temporary input until company-follow data is available to this service.
const createOpportunitySchema = z
  .object({
    company_id: nullableUuid,
    external_company_name: nullableText(255),
    source_type: z.string().trim().min(1).max(100),
    external_id: nullableText(255),
    source_url: z.url().nullable().optional(),
    external_apply_url: z.url().nullable().optional(),
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().min(1).max(50_000),
    responsibilities: nullableText(50_000),
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
    payment_frequency: nullableText(100),
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
    start_date: z.iso.date().nullable().optional(),
    application_deadline: z.iso.datetime().nullable().optional(),
    openings: z.number().int().positive().max(1_000_000).nullable().optional(),
    status: z.string().trim().min(1).max(50).optional(), // Filter by status if provided
    last_synced_at: z.iso.datetime().nullable().optional(),
    expires_at: z.iso.datetime().nullable().optional(),
    created_by: nullableUuid,
    follower_recipients: z.array(recipientSchema).max(10_000).optional(),
  })
  .refine(
    (data) =>
      data.compensation_min == null ||
      data.compensation_max == null ||
      data.compensation_min <= data.compensation_max,
    {
      message: "compensation_min cannot exceed compensation_max",
      path: ["compensation_max"],
    },
  );

const applicationSchema = z.object({
  applicant_name: z.string().trim().min(1).max(120),
  applicant_email: z.email(),
  // Placeholder until company records can provide the hiring contact email.
  company_email: z.email(),
  company_contact_name: z.string().trim().min(1).max(120).optional(),
});

// Handler for creating a new opportunity
const createOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsed = createOpportunitySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid opportunity payload",
      details: z.flattenError(parsed.error),
    });
    return;
  }

  const { follower_recipients, ...opportunityInput } = parsed.data;
  let opportunity: OpportunityRecord;
  try {
    opportunity = await createOpportunity({
      ...opportunityInput,
      skills_required: opportunityInput.skills_required ?? [],
      status: opportunityInput.status ?? "published",
    });
  } catch (error) {
    logger("error", "Failed to create opportunity:", error);
    next(new AppError("Could not create opportunity", 500));
    return;
  }

  let notificationStatus =
    opportunity.status !== "published"
      ? "not_queued_not_published"
      : "not_queued_no_follower_recipients";
  if (opportunity.status === "published" && follower_recipients?.length) {
    try {
      await publishJobCreated(opportunity, follower_recipients);
      notificationStatus = "queued";
    } catch (error) {
      logger(
        "error",
        `Opportunity ${opportunity.id} was created but its notification could not be queued:`,
        error,
      );
      notificationStatus = "failed_to_queue";
    }
  }
  response.status(201).json({
    opportunity,
    notification_status: notificationStatus,
  });
};

// Handler for listing opportunities with optional filters, pagination, and sorting
const listOpportunitiesHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  // Parse and validate query parameters for pagination, sorting, and filtering
  const parsed = OpportunityQuery.fromUrlParameters(request.query);

  // If the query parameters are invalid, return a 400 Bad Request response with error details
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid opportunity filters",
      details: z.flattenError(parsed.error),
    });
    return;
  }

  try {
    const query = parsed.data;
    const result = await listOpportunities(query);

    response.json({
      data: result.items, // Return the list of opportunities
      total: result.total, // Total number of opportunities matching the query
      pagination: query.pagination(result.total),
      sorting: query.sorting(),
    });
  } catch (error) {
    logger("error", "Failed to list opportunities:", error);
    next(new AppError("Could not list opportunities", 500));
  }
};

// Handler for retrieving a specific opportunity by its ID
const getOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsedId = z.uuid().safeParse(request.params.id);
  if (!parsedId.success) {
    response.status(400).json({ error: "Opportunity id must be a UUID" });
    return;
  }

  try {
    const opportunity = await getOpportunityById(parsedId.data);
    if (!opportunity) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }
    response.json({ opportunity });
  } catch (error) {
    logger("error", "Failed to get opportunity:", error);
    next(new AppError("Could not get opportunity", 500));
  }
};

// Handler for notifying the company of a new application for an opportunity
const notifyCompanyOfApplicationHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsedId = z.uuid().safeParse(request.params.id);
  const parsedBody = applicationSchema.safeParse(request.body);
  if (!parsedId.success || !parsedBody.success) {
    response.status(400).json({
      error: "Invalid application notification payload",
      details: parsedBody.success
        ? undefined
        : z.flattenError(parsedBody.error),
    });
    return;
  }

  try {
    const opportunity = await getOpportunityById(parsedId.data);
    if (!opportunity) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }

    // Queue the application notification to be sent to the company
    await publishJobApplication(
      opportunity,
      {
        name: parsedBody.data.applicant_name, // Applicant's name
        email: parsedBody.data.applicant_email, // Applicant's email
      },
      {
        email: parsedBody.data.company_email, // Company's email
        name: parsedBody.data.company_contact_name, // Optional company's contact name
      },
    );
    response.status(202).json({
      status: "application_notification_queued",
      note: "This endpoint queues the company email notification; application storage belongs to the application service.",
    });
  } catch (error) {
    logger("error", "Failed to queue application notification:", error);
    next(new AppError("Could not queue application notification", 503));
  }
};

export {
  createOpportunityHandler,
  listOpportunitiesHandler,
  getOpportunityHandler,
  notifyCompanyOfApplicationHandler,
};
