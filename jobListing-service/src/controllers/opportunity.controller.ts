import type { RequestHandler } from "express";
import { z } from "zod";
import {
  createOpportunity,
  deleteOpportunity,
  getOpportunityById,
  listCompanyOpportunities,
  listOpportunities,
  updateOpportunity,
  type OpportunityRecord,
} from "../models/opportunity.model.js";
import { OpportunityQuery } from "../models/opportunity-query.js";
import {
  publishJobApplication,
  publishJobCreated,
} from "../services/notification-publisher.service.js";
import { AppError } from "../utils/appError.js";
import { logger } from "../utils/logger.js";
import { requireCompanyAdmin } from "../services/company-access.service.js";

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

const opportunityFields = {
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
  application_deadline: z
    .iso
    .datetime()
    .transform((value) => new Date(value))
    .nullable()
    .optional(),
  openings: z.number().int().positive().max(1_000_000).nullable().optional(),
  status: z.enum(["draft", "published", "paused", "closed"]).optional(),
};

const createOpportunitySchema = z
  .object({
    company_id: z.uuid(),
    source_type: z.string().trim().min(1).max(100).default("employer"),
    ...opportunityFields,
    follower_recipients: z.array(recipientSchema).max(10_000).optional(),
  })
  .strict()
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

const updateOpportunitySchema = z
  .object(opportunityFields)
  .partial()
  .strict()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one editable field is required",
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

// Resolve the company for management listings. A JSON body is honoured for API clients;
// browsers cannot send GET bodies, so `company_id` + `scope=company` in the query is also accepted.
const resolveManagedCompanyId = (
  request: Parameters<RequestHandler>[0],
): unknown => {
  const bodyCompanyId = (request.body as { company_id?: unknown } | undefined)
    ?.company_id;
  if (bodyCompanyId !== undefined) return bodyCompanyId;
  return request.query.scope === "company" ? request.query.company_id : undefined;
};

// Only active company administrators may retrieve their company's full listing set, including drafts.
const listCompanyOpportunitiesHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsedCompanyId = z.uuid().safeParse(resolveManagedCompanyId(request));
  const parsedPagination = z
    .object({
      page: z.coerce.number().int().min(1).max(1_000_000).default(1),
      page_size: z.coerce.number().int().min(1).max(100).default(20),
    })
    .safeParse(request.query);

  if (!parsedCompanyId.success || !parsedPagination.success) {
    response.status(400).json({
      error: "Invalid company listing request",
      details: parsedPagination.success
        ? undefined
        : z.flattenError(parsedPagination.error),
    });
    return;
  }

  try {
    if (!request.user?.id) {
      throw new AppError("Authentication is required", 401);
    }
    await requireCompanyAdmin(parsedCompanyId.data, request.user.id);
    const result = await listCompanyOpportunities(
      parsedCompanyId.data,
      parsedPagination.data.page,
      parsedPagination.data.page_size,
    );
    response.json({
      data: result.items,
      total: result.total,
      pagination: {
        page: parsedPagination.data.page,
        page_size: parsedPagination.data.page_size,
        total_items: result.total,
        total_pages: Math.ceil(result.total / parsedPagination.data.page_size),
      },
      sorting: { sort_by: "created_at", sort_order: "desc" },
    });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    logger("error", "Failed to list company opportunities:", error);
    next(new AppError("Could not list company opportunities", 500));
  }
};

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

  try {
    if (!request.user?.id) {
      throw new AppError("Authentication is required", 401);
    }
    const company = await requireCompanyAdmin(
      parsed.data.company_id,
      request.user.id,
    );
    const { follower_recipients, company_id: _companyId, ...opportunityInput } =
      parsed.data;
    const opportunity: OpportunityRecord = await createOpportunity({
      ...opportunityInput,
      company_id: company.id,
      external_company_name: company.name,
      created_by: request.user.id,
      skills_required: opportunityInput.skills_required ?? [],
      status: opportunityInput.status ?? "published",
    });

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
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    logger("error", "Failed to create opportunity:", error);
    next(new AppError("Could not create opportunity", 500));
  }
};

const updateOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsedId = z.uuid().safeParse(request.params.id);
  const parsedBody = updateOpportunitySchema.safeParse(request.body);
  if (!parsedId.success || !parsedBody.success) {
    response.status(400).json({
      error: "Invalid opportunity update",
      details: parsedBody.success
        ? undefined
        : z.flattenError(parsedBody.error),
    });
    return;
  }

  try {
    if (!request.user?.id) {
      throw new AppError("Authentication is required", 401);
    }
    const opportunity = await getOpportunityById(parsedId.data);
    if (!opportunity) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }
    if (!opportunity.company_id) {
      throw new AppError("Opportunity is not owned by a company", 403);
    }
    await requireCompanyAdmin(opportunity.company_id, request.user.id);
    const updated = await updateOpportunity(
      parsedId.data,
      opportunity.company_id,
      parsedBody.data,
    );
    if (!updated) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }
    response.json({ opportunity: updated });
  } catch (error) {
    next(error);
  }
};

const deleteOpportunityHandler: RequestHandler = async (
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
    if (!request.user?.id) {
      throw new AppError("Authentication is required", 401);
    }
    const opportunity = await getOpportunityById(parsedId.data);
    if (!opportunity) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }
    if (!opportunity.company_id) {
      throw new AppError("Opportunity is not owned by a company", 403);
    }
    await requireCompanyAdmin(opportunity.company_id, request.user.id);
    const deleted = await deleteOpportunity(
      parsedId.data,
      opportunity.company_id,
    );
    if (!deleted) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
};

// Handler for listing opportunities with optional filters, pagination, and sorting.
// Requests that name a managed company are diverted to the admin-only listing.
const listOpportunitiesHandler: RequestHandler = (request, response, next) => {
  if (resolveManagedCompanyId(request) !== undefined) {
    if (!request.user?.id) {
      next(new AppError("Authentication is required", 401));
      return;
    }
    void listCompanyOpportunitiesHandler(request, response, next);
    return;
  }
  void listPublicOpportunitiesHandler(request, response, next);
};

const listPublicOpportunitiesHandler: RequestHandler = async (
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
    if (query.filters.status && query.filters.status !== "published") {
      if (!request.user?.id) {
        throw new AppError("Authentication is required", 401);
      }
      if (!query.filters.companyId) {
        throw new AppError(
          "company_id is required when listing unpublished opportunities",
          400,
        );
      }
      await requireCompanyAdmin(query.filters.companyId, request.user.id);
    }
    const result = await listOpportunities(query);

    response.json({
      data: result.items, // Return the list of opportunities
      total: result.total, // Total number of opportunities matching the query
      pagination: query.pagination(result.total),
      sorting: query.sorting(),
    });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
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
    if (opportunity.status !== "published") {
      if (!request.user?.id) {
        throw new AppError("Authentication is required", 401);
      }
      if (!opportunity.company_id) {
        throw new AppError("Opportunity is not owned by a company", 403);
      }
      await requireCompanyAdmin(opportunity.company_id, request.user.id);
    }
    response.json({ opportunity });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
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
  listCompanyOpportunitiesHandler,
  createOpportunityHandler,
  listOpportunitiesHandler,
  getOpportunityHandler,
  updateOpportunityHandler,
  deleteOpportunityHandler,
  notifyCompanyOfApplicationHandler,
};
