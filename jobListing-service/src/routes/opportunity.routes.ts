import { Router } from "express";
import {
  createOpportunityHandler,
  deleteOpportunityHandler,
  getOpportunityHandler,
  listOpportunitiesHandler,
  notifyCompanyOfApplicationHandler,
  updateOpportunityHandler,
} from "../controllers/opportunity.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

export const opportunityRoutes = Router();

// GET / serves public search, and the admin company listing when a company_id is supplied.
opportunityRoutes.get("/", optionalAuth, listOpportunitiesHandler);
opportunityRoutes.post("/", requireAuth, createOpportunityHandler);

opportunityRoutes.get("/:id", optionalAuth, getOpportunityHandler);
opportunityRoutes.put("/:id", requireAuth, updateOpportunityHandler);
opportunityRoutes.patch("/:id", requireAuth, updateOpportunityHandler);
opportunityRoutes.delete("/:id", requireAuth, deleteOpportunityHandler);

// Notify the company of a new application for an opportunity
opportunityRoutes.post("/:id/applications", notifyCompanyOfApplicationHandler);
