import type { RequestHandler } from "express";
import { CompanyModel } from "../models/company.model.js";

/**
 * GET /api/internal/companies/:id/access/:userId
 * Cross-service contract endpoint for downstream microservices (job-service, workspace-service, billing-service).
 * Returns consolidated company status and user permissions. Enforces PRD §14 and §4.2.
 */
export const getCompanyAccess: RequestHandler = async (req, res, next) => {
  try {
    const companyId = String(req.params.id);
    const userId = String(req.params.userId);

    const company = await CompanyModel.findCompanyById(companyId);
    if (!company) {
      res.status(404).json({
        error: "Not Found",
        message: "Company not found",
      });
      return;
    }

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
    const company = await CompanyModel.findCompanyById(companyId);

    if (!company) {
      res.status(404).json({
        error: "Not Found",
        message: "Company not found",
      });
      return;
    }

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
