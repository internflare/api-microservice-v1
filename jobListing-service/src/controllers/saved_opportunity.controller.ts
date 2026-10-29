import type { RequestHandler } from "express";
import {
  isOpportunitySavedByTalent,
  listSavedOpportunitiesForTalent,
  removeSavedOpportunity,
  saveOpportunityForTalent,
} from "../models/saved_opportunity.model.js";
import { getOpportunityById } from "../models/opportunity.model.js";
import { AppError } from "../utils/appError.js";
import {
  allSavedListIndexKey,
  invalidateSaved,
  savedListIndexKey,
  setCached,
} from "../services/cache.service.js";
import { forwardError } from "../utils/forward-error.js";
import {
  formatValidationError,
  objectIdSchema,
  paginationSchema,
  requireUserId,
} from "../validators/opportunity.validator.js";

// Validates the :opportunityId route param or fails with 400.
const parseOpportunityId = (value: unknown): string => {
  const parsed = objectIdSchema.safeParse(value);
  if (!parsed.success) throw new AppError("Invalid opportunity id", 400);
  return parsed.data;
};

// GET /saved-opportunities: the signed-in talent's saved listings, newest first.
const listSavedOpportunitiesHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  const pagination = paginationSchema.safeParse(request.query);
  if (!pagination.success) {
    response.status(400).json({
      error: "Invalid pagination parameters",
      details: formatValidationError(pagination.error),
    });
    return;
  }

  try {
    const talentId = requireUserId(request);
    const { page, page_size } = pagination.data;
    // Middleware result: cached body on a hit, null on a miss.
    let body = response.locals.cached as Record<string, unknown> | null;
    if (!body) {
      const result = await listSavedOpportunitiesForTalent(
        talentId,
        page,
        page_size,
      );
      body = {
        data: result.items,
        total: result.total,
        pagination: {
          page,
          page_size,
          total_items: result.total,
          total_pages: Math.ceil(result.total / page_size),
        },
      };
      if (response.locals.cacheKey) {
        await setCached(response.locals.cacheKey, body, [
          savedListIndexKey(talentId),
          allSavedListIndexKey,
        ]);
      }
    }
    response.json(body);
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to list saved opportunities:",
      "Could not list saved opportunities",
    );
  }
};

// PUT /saved-opportunities/:opportunityId: save a listing (idempotent).
const saveOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const talentId = requireUserId(request);
    const opportunityId = parseOpportunityId(request.params.opportunityId);

    const opportunity = await getOpportunityById(opportunityId);
    if (!opportunity) throw new AppError("Opportunity not found", 404);

    const { created } = await saveOpportunityForTalent(talentId, opportunityId);
    await invalidateSaved(talentId);
    response
      .status(created ? 201 : 200)
      .json({ saved: true, opportunity_id: opportunityId });
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to save opportunity:",
      "Could not save opportunity",
    );
  }
};

// GET /saved-opportunities/:opportunityId: whether the talent has saved this listing.
const getSavedStatusHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const talentId = requireUserId(request);
    const opportunityId = parseOpportunityId(request.params.opportunityId);
    const saved = await isOpportunitySavedByTalent(talentId, opportunityId);
    response.json({ saved, opportunity_id: opportunityId });
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to check saved opportunity:",
      "Could not check saved opportunity",
    );
  }
};

// DELETE /saved-opportunities/:opportunityId: remove a saved listing.
const unsaveOpportunityHandler: RequestHandler = async (
  request,
  response,
  next,
) => {
  try {
    const talentId = requireUserId(request);
    const opportunityId = parseOpportunityId(request.params.opportunityId);
    const removed = await removeSavedOpportunity(talentId, opportunityId);
    if (!removed) throw new AppError("Saved opportunity not found", 404);
    await invalidateSaved(talentId);
    response.status(204).send();
  } catch (error) {
    forwardError(
      error,
      next,
      "Failed to unsave opportunity:",
      "Could not remove saved opportunity",
    );
  }
};

export {
  getSavedStatusHandler,
  listSavedOpportunitiesHandler,
  saveOpportunityHandler,
  unsaveOpportunityHandler,
};
