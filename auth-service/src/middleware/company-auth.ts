import type { RequestHandler } from "express";
import { CompanyModel } from "../models/company.model.js";
import type { CompanyMemberRole } from "../types/company.types.js";

/**
 * Middleware ensuring the authenticated user is an ACTIVE member of the company specified by :id.
 * Enforces PRD §14: If a user is REMOVED, access is immediately blocked with 403 Forbidden.
 */
export const requireCompanyMember: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
      return;
    }

    const rawCompanyId = req.params.id;
    if (!rawCompanyId || Array.isArray(rawCompanyId)) {
      res.status(400).json({ error: "Missing or invalid company ID in route parameters" });
      return;
    }
    const companyId = String(rawCompanyId);

    const member = await CompanyModel.findMember(companyId, req.user.id);

    if (!member) {
      res.status(403).json({
        error: "Forbidden",
        message: "You are not a member of this company",
      });
      return;
    }

    if (member.status === "REMOVED") {
      res.status(403).json({
        error: "Forbidden",
        message: "Access revoked: user is no longer a member of this company",
      });
      return;
    }

    if (member.status === "INVITED") {
      res.status(403).json({
        error: "Forbidden",
        message: "Membership invitation is pending acceptance",
      });
      return;
    }

    req.companyMember = member;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Higher-order middleware ensuring the active company member has one of the required roles.
 */
export function requireCompanyRole(allowedRoles: CompanyMemberRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.companyMember) {
      res.status(403).json({
        error: "Forbidden",
        message: "Company membership context not found",
      });
      return;
    }

    if (!allowedRoles.includes(req.companyMember.workspace_role)) {
      res.status(403).json({
        error: "Forbidden",
        message: `Action requires one of the following roles: ${allowedRoles.join(", ")}`,
      });
      return;
    }

    next();
  };
}

/**
 * Middleware ensuring the target company has achieved VERIFIED status (PRD §4.2).
 * Restricts sensitive downstream actions (e.g. live job posting or financial operations).
 */
export const requireCompanyVerified: RequestHandler = async (req, res, next) => {
  try {
    const rawCompanyId =
      req.params.id || req.body?.company_id || req.companyMember?.company_id;

    if (!rawCompanyId) {
      res.status(400).json({
        error: "Bad Request",
        message: "Company ID is required to evaluate verification status",
      });
      return;
    }

    const companyId = String(rawCompanyId);
    const company = await CompanyModel.findCompanyById(companyId);

    if (!company) {
      res.status(404).json({
        error: "Not Found",
        message: "Company not found",
      });
      return;
    }

    if (company.verification_status !== "VERIFIED") {
      res.status(403).json({
        error: "Forbidden",
        message: `Company verification required. Current verification status is ${company.verification_status}`,
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
