import { findApplicationById } from "../models/application.model.js";
import { getOpportunityById } from "../models/opportunity.model.js";
import { AppError } from "../utils/appError.js";
import { checkAdmin } from "../utils/helperFunc.js";
import { parseOrFail } from "../utils/parse-or-fail.js";
import { objectIdSchema } from "../validators/opportunity.validator.js";

const parseApplicationId = (value: unknown): string =>
  parseOrFail(objectIdSchema.safeParse(value), "Invalid application id");

// Loads an application and the listing it belongs to, for company-side access checks.
const loadApplicationWithListing = async (id: unknown) => {
  const application = await findApplicationById(parseApplicationId(id));
  if (!application) throw new AppError("Application not found", 404);
  const opportunity = await getOpportunityById(application.opportunity_id);
  if (!opportunity) throw new AppError("Listing for this application no longer exists", 404);
  return { application, opportunity };
};

const requireListingAdmin = async (
  companyId: string | null,
  userId: string,
): Promise<void> => {
  if (!companyId || !(await checkAdmin(companyId, userId))) {
    throw new AppError("User is not an active admin of the company", 403);
  }
};

export { loadApplicationWithListing, parseApplicationId, requireListingAdmin };
