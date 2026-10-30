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
  recordViewHandler,
  updateOpportunityHandler,
} from "../controllers/opportunity.controller.js";
import {
  editMyApplicationHandler,
  getApplicationHandler,
  listCompanyApplicationsHandler,
  listMyApplicationsHandler,
  listMyAppliedIdsHandler,
  submitApplicationHandler,
  updateApplicationHandler,
  withdrawApplicationHandler,
} from "../controllers/application.controller.js";
import {
  createInterviewHandler,
  listApplicationInterviewsHandler,
  listCompanyInterviewsHandler,
  listMyInterviewsHandler,
  respondInterviewHandler,
  updateInterviewHandler,
} from "../controllers/interview.controller.js";
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

// Applications: registered before "/:id" so "applications" is not read as a listing id.
opportunityRoutes.get("/applications/mine/ids", requireAuth, listMyAppliedIdsHandler);
opportunityRoutes.get("/applications/mine", requireAuth, listMyApplicationsHandler);
opportunityRoutes.get("/applications", requireAuth, listCompanyApplicationsHandler);
opportunityRoutes
  .route("/applications/:id")
  .get(requireAuth, getApplicationHandler)
  .patch(requireAuth, updateApplicationHandler);
opportunityRoutes.post("/applications/:id/withdraw", requireAuth, withdrawApplicationHandler);
opportunityRoutes.patch("/applications/:id/mine", requireAuth, editMyApplicationHandler);
opportunityRoutes
  .route("/applications/:id/interviews")
  .get(requireAuth, listApplicationInterviewsHandler)
  .post(requireAuth, createInterviewHandler);

// Interviews: registered before "/:id" for the same reason.
opportunityRoutes.get("/interviews/mine", requireAuth, listMyInterviewsHandler);
opportunityRoutes.get("/interviews", requireAuth, listCompanyInterviewsHandler);
opportunityRoutes.post("/interviews/:id/respond", requireAuth, respondInterviewHandler);
opportunityRoutes.patch("/interviews/:id", requireAuth, updateInterviewHandler);

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
opportunityRoutes.post("/:id/applications", requireAuth, submitApplicationHandler);
