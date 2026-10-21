import { Router } from "express";
import {
  decideVerification,
  getAdminDashboardMetrics,
  listPendingVerifications,
} from "../controllers/employer.controller.js";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import {
  adminVerificationDecisionSchema,
  uuidParamSchema,
} from "../validators/company.validator.js";

export const employerRoutes = Router();

// All employer routes require an authenticated user.
employerRoutes.use(requireAuth);

// Verification review is restricted to platform administrators.
employerRoutes.get(
  "/verifications",
  requirePlatformAdmin,
  listPendingVerifications,
);

// Employer dashboard metrics are scoped to the authenticated user's company.
employerRoutes.get("/dashboard", getAdminDashboardMetrics);

employerRoutes.post(
  "/verifications/:id/decision",
  requirePlatformAdmin,
  validateParams(uuidParamSchema),
  validateBody(adminVerificationDecisionSchema),
  decideVerification,
);
