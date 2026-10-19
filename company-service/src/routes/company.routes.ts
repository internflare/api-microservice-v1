import { Router } from "express";
import {
  acceptMembershipInvite,
  createCompany,
  getCompanyById,
  inviteCompanyMember,
  listCompanyMembers,
  listCompanyVerifications,
  removeCompanyMember,
  submitCompanyVerification,
  updateCompany,
} from "../controllers/company.controller.js";
import { requireAuth } from "../middleware/auth.js";
import {
  requireCompanyMember,
  requireCompanyRole,
} from "../middleware/company-auth.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import {
  createCompanySchema,
  inviteMemberSchema,
  memberParamSchema,
  submitVerificationSchema,
  updateCompanySchema,
  uuidParamSchema,
} from "../validators/company.validator.js";

export const companyRoutes = Router();

// All company operations require an active authenticated user
companyRoutes.use(requireAuth);

// 1. Company CRUD
companyRoutes.post(
  "/",
  validateBody(createCompanySchema),
  createCompany,
);

companyRoutes.get(
  "/:id",
  validateParams(uuidParamSchema),
  requireCompanyMember,
  getCompanyById,
);

companyRoutes.patch(
  "/:id",
  validateParams(uuidParamSchema),
  validateBody(updateCompanySchema),
  requireCompanyMember,
  requireCompanyRole(["ADMIN"]),
  updateCompany,
);

// 2. Member Management
companyRoutes.post(
  "/:id/members/invite",
  validateParams(uuidParamSchema),
  validateBody(inviteMemberSchema),
  requireCompanyMember,
  requireCompanyRole(["ADMIN"]),
  inviteCompanyMember,
);

companyRoutes.get(
  "/:id/members",
  validateParams(uuidParamSchema),
  requireCompanyMember,
  listCompanyMembers,
);

companyRoutes.post(
  "/:id/members/accept",
  validateParams(uuidParamSchema),
  acceptMembershipInvite,
);

companyRoutes.delete(
  "/:id/members/:memberId",
  validateParams(memberParamSchema),
  requireCompanyMember,
  requireCompanyRole(["ADMIN"]),
  removeCompanyMember,
);

// 3. Verification Submissions
companyRoutes.post(
  "/:id/verifications",
  validateParams(uuidParamSchema),
  validateBody(submitVerificationSchema),
  requireCompanyMember,
  requireCompanyRole(["ADMIN"]),
  submitCompanyVerification,
);

companyRoutes.get(
  "/:id/verifications",
  validateParams(uuidParamSchema),
  requireCompanyMember,
  listCompanyVerifications,
);
