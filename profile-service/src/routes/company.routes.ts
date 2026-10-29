import { Router } from "express";
import {
  acceptMembershipInvite,
  createCompany,
  getCompanyById,
  inviteCompanyMember,
  inviteTeamMembers,
  listMyAdminCompanies,
  listAllPostedJobs,
  listCompanyMembers,
  listCompanyVerifications,
  removeCompanyMember,
  submitCompanyVerification,
  updateCompany,
} from "../controllers/company.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import {
  followCompanyHandler,
  getCompanyTalentPool,
  getPublicCompany,
  unfollowCompanyHandler,
} from "../controllers/company-public.controller.js";
import { employerSubmission } from "../middleware/upload.js";
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
  teamInvitesSchema,
  updateCompanySchema,
  objectIdParamSchema,
} from "../validators/company.validator.js";

export const companyRoutes = Router();

// Public company page: open to visitors, enriched with `is_following` when signed in.
companyRoutes.get(
  "/:id/public",
  validateParams(objectIdParamSchema),
  optionalAuth,
  getPublicCompany,
);

// All remaining company operations require an active authenticated user
companyRoutes.use(requireAuth);

companyRoutes.put("/:id/follow", validateParams(objectIdParamSchema), followCompanyHandler);
companyRoutes.delete("/:id/follow", validateParams(objectIdParamSchema), unfollowCompanyHandler);
companyRoutes.get(
  "/:id/talent-pool",
  validateParams(objectIdParamSchema),
  requireCompanyMember,
  getCompanyTalentPool,
);

// 1. Company CRUD
companyRoutes.post(
  "/employer-onboarding",
  employerSubmission,
  validateBody(createCompanySchema),
  createCompany,
);

//get job listing
companyRoutes.get("/job-listing", listAllPostedJobs);
companyRoutes.get("/mine", listMyAdminCompanies);

companyRoutes.get(
  "/:id",
  validateParams(objectIdParamSchema),
  requireCompanyMember,
  getCompanyById,
);

companyRoutes.patch(
  "/:id",
  validateParams(objectIdParamSchema),
  validateBody(updateCompanySchema),
  requireCompanyMember,
  requireCompanyRole(["ADMIN"]),
  updateCompany,
);

// 2. Member Management
companyRoutes.post(
  "/:id/members/invite",
  validateParams(objectIdParamSchema),
  validateBody(inviteMemberSchema),
  requireCompanyMember,
  requireCompanyRole(["ADMIN"]),
  inviteCompanyMember,
);

companyRoutes.post(
  "/:id/invites",
  validateParams(objectIdParamSchema),
  validateBody(teamInvitesSchema),
  requireCompanyMember,
  requireCompanyRole(["ADMIN"]),
  inviteTeamMembers,
);

companyRoutes.get(
  "/:id/members",
  validateParams(objectIdParamSchema),
  requireCompanyMember,
  listCompanyMembers,
);

companyRoutes.post(
  "/:id/members/accept",
  validateParams(objectIdParamSchema),
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
  validateParams(objectIdParamSchema),
  validateBody(submitVerificationSchema),
  requireCompanyMember,
  requireCompanyRole(["ADMIN"]),
  submitCompanyVerification,
);

companyRoutes.get(
  "/:id/verifications",
  validateParams(objectIdParamSchema),
  requireCompanyMember,
  listCompanyVerifications,
);

