import { Router } from "express";
import {
  getSavedStatusHandler,
  listSavedOpportunitiesHandler,
  saveOpportunityHandler,
  unsaveOpportunityHandler,
} from "../controllers/saved_opportunity.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { savedListCache } from "../middleware/cache.js";

export const savedOpportunityRoutes = Router();

// Every saved-opportunity route is scoped to the authenticated talent.
savedOpportunityRoutes.use(requireAuth);

savedOpportunityRoutes.get("/", savedListCache, listSavedOpportunitiesHandler);
savedOpportunityRoutes
  .route("/:opportunityId")
  .get(getSavedStatusHandler)
  .put(saveOpportunityHandler)
  .delete(unsaveOpportunityHandler);
