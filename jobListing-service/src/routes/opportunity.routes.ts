import { Router } from "express";
import {
  createDraftHandler,
  deleteDraftHandler,
  getDraftHandler,
  listDraftsHandler,
  updateDraftHandler,
} from "../controllers/draft.controller.js";
import {
  createOpportunityHandler,
  deleteOpportunityHandler,
  getEligibilityHandler,
  getOpportunityHandler,
  listOpportunitiesHandler,
  notifyCompanyOfApplicationHandler,
  recordViewHandler,
  updateOpportunityHandler,
} from "../controllers/opportunity.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import {
  opportunityDetailCache,
  opportunityListCache,
} from "../middleware/cache.js";

export const opportunityRoutes = Router();

// Drafts live in Redis only. Registered before "/:id" so "drafts" is not read as an id.
opportunityRoutes.get("/drafts", requireAuth, listDraftsHandler);
opportunityRoutes.post("/drafts", requireAuth, createDraftHandler);
opportunityRoutes
  .route("/drafts/:id")
  .get(requireAuth, getDraftHandler)
  .put(requireAuth, updateDraftHandler)
  .delete(requireAuth, deleteDraftHandler);

// GET / serves public search, and the admin company listing when a company_id is supplied.
opportunityRoutes
  .route("/")
  .get(optionalAuth, opportunityListCache, listOpportunitiesHandler) // Redis lookup for company and public lists
  .post(requireAuth, createOpportunityHandler); // Require authentication to create an opportunity

opportunityRoutes
  .route("/:id")
  .get(optionalAuth, opportunityDetailCache, getOpportunityHandler)
  .put(requireAuth, updateOpportunityHandler)
  .patch(requireAuth, updateOpportunityHandler)
  .delete(requireAuth, deleteOpportunityHandler);

// Eligibility check, unique-viewer counting and applications all require a signed-in talent.
opportunityRoutes.get("/:id/eligibility", requireAuth, getEligibilityHandler);
opportunityRoutes.post("/:id/view", requireAuth, recordViewHandler);
opportunityRoutes.post(
  "/:id/applications",
  requireAuth,
  notifyCompanyOfApplicationHandler,
);
