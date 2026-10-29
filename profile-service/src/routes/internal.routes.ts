import { Router } from "express";
import { z } from "zod";
import {
  acceptInviteByToken,
  getCompanyAccess,
  getCompanyVerificationStatus,
  getInviteDetails,
} from "../controllers/internal.controller.js";
import { requireInternalServiceAuth } from "../middleware/internal-auth.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import {
  acceptInviteBodySchema,
  inviteTokenParamSchema,
  objectIdParamSchema,
} from "../validators/company.validator.js";

export const internalRoutes = Router();

// Protect all internal service routes with shared secret authentication
internalRoutes.use(requireInternalServiceAuth);

const accessParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid company ObjectId format"),
  userId: z.string().trim().min(1, "User ID is required"),
});

internalRoutes.get(
  "/companies/:id/access/:userId",
  validateParams(accessParamSchema),
  getCompanyAccess,
);

internalRoutes.get(
  "/invites/:token",
  validateParams(inviteTokenParamSchema),
  getInviteDetails,
);

internalRoutes.post(
  "/invites/:token/accept",
  validateParams(inviteTokenParamSchema),
  validateBody(acceptInviteBodySchema),
  acceptInviteByToken,
);

internalRoutes.get(
  "/companies/:id/verification",
  validateParams(objectIdParamSchema),
  getCompanyVerificationStatus,
);


