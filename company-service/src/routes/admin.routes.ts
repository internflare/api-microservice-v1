import { Router } from "express";
import {
  decideVerification,
  listPendingVerifications,
} from "../controllers/admin.controller.js";
import { requireAuth, requirePlatformAdmin } from "../middleware/auth.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import {
  adminVerificationDecisionSchema,
  uuidParamSchema,
} from "../validators/company.validator.js";

export const adminRoutes = Router();

// Protect all admin routes with authentication and platform administrator privileges
adminRoutes.use(requireAuth, requirePlatformAdmin);

// Admin verification decision routes
adminRoutes.get("/verifications", listPendingVerifications);

adminRoutes.post(
  "/verifications/:id/decision",
  validateParams(uuidParamSchema),
  validateBody(adminVerificationDecisionSchema),
  decideVerification,
);
