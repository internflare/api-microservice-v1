import { Router } from "express";
import {
  createOpportunityHandler,
  getOpportunityHandler,
  listOpportunitiesHandler,
  notifyCompanyOfApplicationHandler,
} from "../controllers/opportunity.controller.js";

export const opportunityRoutes = Router();

opportunityRoutes.get("/", listOpportunitiesHandler); // List all opportunities with optional filters
opportunityRoutes.post("/", createOpportunityHandler); // Create a new opportunity

opportunityRoutes.get("/:id", getOpportunityHandler); // Get a specific opportunity by ID

// Notify the company of a new application for an opportunity
opportunityRoutes.post("/:id/applications", notifyCompanyOfApplicationHandler);
