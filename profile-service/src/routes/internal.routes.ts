import { Router } from "express";
import { z } from "zod";
import {
  getCompanyAccess,
  getCompanyVerificationStatus,
} from "../controllers/internal.controller.js";
import { requireInternalServiceAuth } from "../middleware/internal-auth.js";
import { validateParams } from "../middleware/validate.js";
import { uuidParamSchema } from "../validators/company.validator.js";

export const internalRoutes = Router();

// Protect all internal service routes with shared secret authentication
internalRoutes.use(requireInternalServiceAuth);

const accessParamSchema = z.object({
  id: z.string().uuid("Invalid company UUID format"),
  userId: z.string().trim().min(1, "User ID is required"),
});

internalRoutes.get(
  "/companies/:id/access/:userId",
  validateParams(accessParamSchema),
  getCompanyAccess,
);

internalRoutes.get(
  "/companies/:id/verification",
  validateParams(uuidParamSchema),
  getCompanyVerificationStatus,
);
