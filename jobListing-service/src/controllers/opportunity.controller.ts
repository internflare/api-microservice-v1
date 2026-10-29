import type { RequestHandler } from "express";
import {
  createOpportunity,
  deleteOpportunity,
  getOpportunityById,
  listCompanyOpportunities,
  listOpportunities,
  updateOpportunity,
  type OpportunityRecord,
} from "../models/opportunity.model.js";
import { checkAdmin, findUserContact } from "../utils/helperFunc.js";
import { checkEligibility } from "../services/eligibility.service.js";
import { recordUniqueView } from "../models/opportunity-view.model.js";
import { OpportunityQuery } from "../models/opportunity-query.js";
import {
  publishJobApplication,
  publishJobCreated,
} from "../services/notification-publisher.service.js";
import {
  companyListIndexKey,
  invalidateCompany,
  PUBLIC_LIST_TTL_SECONDS,
  publicListIndexKey,
  setCached,
} from "../services/cache.service.js";
import { AppError } from "../utils/appError.js";
import { forwardError } from "../utils/forward-error.js";
import { logger } from "../utils/logger.js";
import { requireCompanyAdmin } from "../services/company-access.service.js";
import { loadManagedOpportunity, loadPublishedOpportunity } from "../services/opportunity-access.service.js";
import {
  companyListPaginationSchema,
  createOpportunitySchema,
  formatValidationError,
  objectIdSchema,
  requireUserId,
  resolveManagedCompanyId,
  updateOpportunitySchema,
} from "../validators/opportunity.validator.js";

// Only active company administrators may retrieve their company's full listing set, including drafts.
const listOpportunityByCompany: RequestHandler = async (
  request,
  response,
  next,
) => {
  // Parse and validate the company ID and pagination parameters from the request.
  const parsedCompanyId = objectIdSchema.safeParse(
    resolveManagedCompanyId(request),
  );
  const parsedPagination = companyListPaginationSchema.safeParse(request.query);

  if (!parsedCompanyId.success || !parsedPagination.success) {
    response.status(400).json({
      error: "Invalid company listing request",
      details: parsedPagination.success
        ? undefined
        : formatValidationError(parsedPagination.error),
    });
    return;
  }

  try {
    const userId = requireUserId(request);
    const isAdmin = userId
      ? await checkAdmin(parsedCompanyId.data, userId)
      : false;
    if (!isAdmin) {
      throw new AppError("Active company administrator access required", 403);
    }
    // Middleware result: cached body on a hit, null on a miss (access check above ran either way).
    let body = response.locals.cached as Record<string, unknown> | null;
    if (!body) {
      const result = await listCompanyOpportunities(
        parsedCompanyId.data,
        parsedPagination.data.page,
        parsedPagination.data.page_size,
      );
      body = {
        data: result.items,
        total: result.total,
        pagination: {
          page: parsedPagination.data.page,
          page_size: parsedPagination.data.page_size,
          total_items: result.total,
          total_pages: Math.ceil(
            result.total / parsedPagination.data.page_size,
          ),
        },
        sorting: { sort_by: "created_at", sort_order: "desc" },
      };
      // Cache miss: save the fresh body (no expiry) before responding.
      if (response.locals.cacheKey) {
        await setCached(
          response.locals.cacheKey,
          body,
          companyListIndexKey(parsedCompanyId.data),
        );
      }
    }
    response.status(200).json(body);
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to list company opportunities:",
      "Could not list company opportunities",
    );
  }
};

// Handler for creating a new opportunity
const createOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  // Ensure the user is an active admin of the company before proceeding
  const parsed = createOpportunitySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid opportunity payload",
      details: formatValidationError(parsed.error),
    });
    return;
  }

  try {
    const userId = requireUserId(request);
    const isAdmin = await checkAdmin(parsed.data.company_id, userId);
    if (!isAdmin)
      throw new AppError("Active company administrator access required", 403);
    // const company = await requireCompanyAdmin(parsed.data.company_id, userId)
    const {
      follower_recipients,
      company_id: _companyId,
      ...opportunityInput
    } = parsed.data;

    logger("info", "Parsed opportunity payload:", parsed);
    const opportunity: OpportunityRecord = await createOpportunity({
      ...opportunityInput,
      company_id: isAdmin.id,
      external_company_name: isAdmin.name,
      created_by: userId,
      skills_required: opportunityInput.skills_required ?? [],
      status: opportunityInput.status ?? "published",
    });

    // New listing makes every cached list for this company stale.
    await invalidateCompany(opportunity.company_id ?? isAdmin.id);

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
    forwardError(
      error,
      next,
      "Failed to create opportunity:",
      "Could not create opportunity",
    );
  }
};

// Handler for editing an opportunity; only active admins of the owning company may do so.
const updateOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsedId = objectIdSchema.safeParse(request.params.id);
  const parsedBody = updateOpportunitySchema.safeParse(request.body);
  if (!parsedId.success || !parsedBody.success) {
    response.status(400).json({
      error: "Invalid opportunity update",
      details: parsedBody.success
        ? undefined
        : formatValidationError(parsedBody.error),
    });
    return;
  }

  try {
    // Load the opportunity and ensure the user has management rights for it
    const opportunity = await loadManagedOpportunity(
      parsedId.data,
      requireUserId(request),
    );

    // Ensure the user is an active admin of the company before updating the opportunity
    const isAdmin = opportunity
      ? await checkAdmin(opportunity.company_id, requireUserId(request))
      : (() => {
          throw new AppError("Job opportunity not found", 404);
        })();

    // job exists but user is not an admin of the company
    if (!isAdmin && opportunity)
      throw new AppError("User is not an active admin of the company", 403);

    // update opportunity
    const updated = await updateOpportunity(
      parsedId.data,
      opportunity.company_id,
      parsedBody.data,
    );

    // if update fails
    if (!updated)
      throw new AppError("Unable to update opportunity, try again", 400);

    // Drop cached lists and this listing's detail so the next read refetches.
    await invalidateCompany(opportunity.company_id, parsedId.data);

    response.status(200).json({ opportunity: updated });
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to update opportunity:",
      "Could not update opportunity",
    );
  }
};

// Handler for deleting an opportunity; only active admins of the owning company may do so.
const deleteOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const parsedId = objectIdSchema.safeParse(request.params.id);
  if (!parsedId.success) {
    response.status(400).json({ error: "Opportunity id must be a valid id" });
    return;
  }

  try {
    // Load the opportunity and ensure the user has management rights for it
    const opportunity = await loadManagedOpportunity(
      parsedId.data,
      requireUserId(request),
    );

    // Ensure the user is an active admin of the company before deleting the opportunity
    const isAdmin = opportunity
      ? await checkAdmin(opportunity.company_id, requireUserId(request))
      : (() => {
          throw new AppError("Job opportunity not found", 404);
        })();

    // job exists but user is not an admin of the company
    if (!isAdmin && opportunity)
      throw new AppError("User is not an active admin of the company", 403);

    //
    const deleted = await deleteOpportunity(
      parsedId.data,
      opportunity.company_id,
    );
    if (!deleted) throw new AppError("Unable to delete opportunity", 400);
    await invalidateCompany(opportunity.company_id, parsedId.data);
    response.status(204).end();
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to delete opportunity:",
      "Could not delete opportunity",
    );
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
    //
    void listOpportunityByCompany(request, response, next);
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
      details: formatValidationError(parsed.error),
    });
    return;
  }

  try {
    const query = parsed.data;
    if (query.filters.status && query.filters.status !== "published") {
      const userId = requireUserId(request);
      if (!query.filters.companyId) {
        throw new AppError(
          "company_id is required when listing unpublished opportunities",
          400,
        );
      }
      await checkAdmin(query.filters.companyId, userId);
    }

    // Middleware result: cached body on a hit, null on a miss.
    let body = response.locals.cached as Record<string, unknown> | null;
    if (!body) {
      const result = await listOpportunities(query);
      body = {
        data: result.items, // Return the list of opportunities
        total: result.total, // Total number of opportunities matching the query
        pagination: query.pagination(result.total),
        sorting: query.sorting(),
      };
      if (response.locals.cacheKey) {
        await setCached(
          response.locals.cacheKey,
          body,
          publicListIndexKey,
          PUBLIC_LIST_TTL_SECONDS,
        );
      }
    }
    response.json(body);
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to list opportunities:",
      "Could not list opportunities",
    );
  }
};

// Handler for retrieving a specific opportunity by its ID
const getOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    // Validate the opportunity ID from the request parameters. It must be an ObjectId.
    const parsedId = objectIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      throw new AppError("Opportunity id must be a valid id", 400);
    }

    // Middleware result: cached payload on a hit, null on a miss.
    const cached = response.locals.cached as {
      opportunity: OpportunityRecord;
    } | null;
    const opportunity =
      cached?.opportunity ?? (await getOpportunityById(parsedId.data));
    if (!opportunity) {
      response.status(404).json({ error: "Opportunity not found" });
      return;
    }

    // Access checks run for both hits and misses, so cached data never bypasses permissions.
    const userId = requireUserId(request);
    if (!opportunity.company_id) {
      throw new AppError("Opportunity has no associated company", 404);
    }
    const isAdmin = await checkAdmin(opportunity.company_id, userId);
    if (opportunity.status !== "published" && !isAdmin) {
      // Unpublished listings are visible only to admins of the owning company.
      throw new AppError("User is not an active admin of the company", 403);
    }

    // Cache miss: save the fresh record (only after access checks pass), then respond.
    if (!cached && response.locals.cacheKey) {
      await setCached(response.locals.cacheKey, { opportunity });
    }
    response.json({ opportunity });
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to get opportunity:",
      "Could not get opportunity",
    );
  }
};

// GET /:id/eligibility: whether the signed-in talent may apply, based on their assessment for the listing's role.
const getEligibilityHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const opportunity = await loadPublishedOpportunity(request.params.id);
    response.json(await checkEligibility(opportunity, userId));
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to check eligibility:",
      "Could not check eligibility",
    );
  }
};

// POST /:id/view: counts one view per signed-in user per listing (repeat views and the
// company's own admins are ignored, so employers see unique viewers, not impressions).
const recordViewHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const opportunity = await loadPublishedOpportunity(request.params.id);

    const isOwner =
      opportunity.created_by === userId ||
      (opportunity.company_id
        ? Boolean(await checkAdmin(opportunity.company_id, userId))
        : false);
    if (isOwner) {
      response.json({ counted: false });
      return;
    }

    const counted = await recordUniqueView(opportunity.id, userId);
    // Cached lists embed views_count, so a new unique view makes them stale.
    if (counted && opportunity.company_id) {
      await invalidateCompany(opportunity.company_id, opportunity.id);
    }
    response.json({ counted });
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to record opportunity view:",
      "Could not record view",
    );
  }
};

// POST /:id/applications: eligible talents apply; the applicant identity comes from the session, never the body.
const notifyCompanyOfApplicationHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const userId = requireUserId(request);
    const applicantEmail = request.user?.email;
    if (!applicantEmail) {
      throw new AppError("Your account has no email address", 400);
    }
    const opportunity = await loadPublishedOpportunity(request.params.id);

    const eligibility = await checkEligibility(opportunity, userId);
    if (eligibility.state !== "eligible") {
      response.status(403).json({
        error: "You are not eligible to apply for this listing",
        eligibility,
      });
      return;
    }

    // Notify the listing creator; failing to queue the email must not hide a valid application.
    const contact = opportunity.created_by
      ? await findUserContact(opportunity.created_by)
      : null;
    if (contact) {
      await publishJobApplication(
        opportunity,
        { name: request.user?.name ?? applicantEmail, email: applicantEmail },
        contact,
      );
    } else {
      logger("warn", `No contact found to notify for opportunity ${opportunity.id}`);
    }
    response.status(202).json({ status: "application_notification_queued" });
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to submit application:",
      "Could not submit application",
    );
  }
};

export {
  listOpportunityByCompany,
  createOpportunityHandler,
  listOpportunitiesHandler,
  getOpportunityHandler,
  updateOpportunityHandler,
  deleteOpportunityHandler,
  notifyCompanyOfApplicationHandler,
  getEligibilityHandler,
  recordViewHandler,
};
