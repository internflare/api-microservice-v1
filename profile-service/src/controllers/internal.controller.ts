import type { RequestHandler } from "express";
import { CompanyModel } from "../models/company.model.js";
import { CompanyInviteModel } from "../models/company-invite.model.js";
import { findCompanyOrRespond404 } from "../validators/company-access.validator.js";

/**
 * GET /internal/invites/:token
 * Returns the company, invited email and role for a usable invite token (used by auth-service).
 */
export const getInviteDetails: RequestHandler = async (req, res, next) => {
  try {
    const invite = await CompanyInviteModel.getInviteDetails(String(req.params.token));
    res.status(200).json({ invite });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /internal/invites/:token/accept
 * Links a newly created user to the inviting company as an ACTIVE member.
 */
export const acceptInviteByToken: RequestHandler = async (req, res, next) => {
  try {
    const invite = await CompanyInviteModel.acceptInvite(
      String(req.params.token),
      req.body.user_id,
      req.body.email,
    );
    res.status(200).json({ invite });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/internal/companies/:id/access/:userId
 * Cross-service contract endpoint for downstream microservices (job-service, workspace-service, billing-service).
 * Returns consolidated company status and user permissions. Enforces PRD §14 and §4.2.
 */
export const getCompanyAccess: RequestHandler = async (req, res, next) => {
  try {
    const companyId = String(req.params.id);
    const userId = String(req.params.userId);

    const company = await findCompanyOrRespond404(companyId, res);
    if (!company) return;

    const member = await CompanyModel.findMember(companyId, userId);
    const isVerified = company.verification_status === "VERIFIED";
    const hasAccess = member !== null && member.status === "ACTIVE";

    res.status(200).json({
      company: {
        id: company.id,
        name: company.name,
        country: company.country,
        verification_status: company.verification_status,
        is_verified: isVerified,
      },
      membership: member
        ? {
            id: member.id,
            user_id: member.user_id,
            workspace_role: member.workspace_role,
            status: member.status,
            has_access: hasAccess,
            joined_at: member.joined_at,
            removed_at: member.removed_at,
          }
        : null,
      has_access: hasAccess,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/internal/companies/:id/verification
 * Lightweight cross-service endpoint to inspect verification status for feature gating.
 */
export const getCompanyVerificationStatus: RequestHandler = async (req, res, next) => {
  try {
    const companyId = String(req.params.id);
    const company = await findCompanyOrRespond404(companyId, res);
    if (!company) return;

    res.status(200).json({
      company_id: company.id,
      name: company.name,
      verification_status: company.verification_status,
      is_verified: company.verification_status === "VERIFIED",
      registration_number: company.registration_number ?? null,
    });
  } catch (error) {
    next(error);
  }
};
