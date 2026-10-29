import {
  getOpportunityById,
  type OpportunityRecord,
} from "../models/opportunity.model.js";
import { AppError } from "../utils/appError.js";
import { requireCompanyAdmin } from "./company-access.service.js";

// Load an opportunity and confirm the user administers its owning company.
// Throws 404 when missing and 403 when it has no owning company or the user lacks access.
const loadManagedOpportunity = async (
  opportunityId: string,
  userId: string,
): Promise<OpportunityRecord & { company_id: string }> => {
  const opportunity = await getOpportunityById(opportunityId);
  if (!opportunity) throw new AppError("Opportunity not found", 404);
  if (!opportunity.company_id) {
    throw new AppError("Opportunity is not owned by a company", 403);
  }
  await requireCompanyAdmin(opportunity.company_id, userId);
  return { ...opportunity, company_id: opportunity.company_id };
};

// Loads a listing for a talent-facing action: 400 for a bad id, 404 when missing or not published.
const loadPublishedOpportunity = async (
  id: unknown,
): Promise<OpportunityRecord> => {
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) {
    throw new AppError("Opportunity id must be a valid id", 400);
  }
  const opportunity = await getOpportunityById(id);
  if (!opportunity || opportunity.status !== "published") {
    throw new AppError("Opportunity not found", 404);
  }
  return opportunity;
};

export { loadManagedOpportunity, loadPublishedOpportunity };
