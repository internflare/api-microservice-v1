import type { RequestHandler } from "express";
import { CompanyModel } from "../models/company.model.js";

/**
 * POST /api/companies
 * Creates a new company and atomically registers the creator as an ACTIVE ADMIN.
 */
export const createCompany: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res
        .status(401)
        .json({ error: "Unauthorized", message: "Authentication required" });
      return;
    }

    const newCompany = await CompanyModel.createCompanyWithAdmin(
      req.body,
      userId,
      req.ip,
    );

    // If the company creation fails, respond with a 400 Bad Request
    if (!newCompany) {
      res
        .status(400)
        .json({ error: "Bad Request", message: "Failed to create company" });
      return;
    }

    const { company, member } = newCompany;

    res.status(201).json({
      message: "Company created successfully",
      company,
      member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:id
 * Retrieves company profile details.
 */
export const getCompanyById: RequestHandler = async (req, res, next) => {
  try {
    const companyId = String(req.params.id);
    const company = await CompanyModel.findCompanyById(companyId);
    if (!company) {
      res
        .status(404)
        .json({ error: "Not Found", message: "Company not found" });
      return;
    }

    res.status(200).json({ company });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/companies/:id
 * Updates company profile information. Restricted to company ADMINs.
 */
export const updateCompany: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const companyId = String(req.params.id);
    const updated = await CompanyModel.updateCompany(
      companyId,
      req.body,
      userId,
      req.ip,
    );

    if (!updated) {
      res
        .status(404)
        .json({ error: "Not Found", message: "Company not found" });
      return;
    }

    res.status(200).json({
      message: "Company updated successfully",
      company: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/companies/:id/members/invite
 * Invites a user to the company with status INVITED. Restricted to company ADMINs.
 */
export const inviteCompanyMember: RequestHandler = async (req, res, next) => {
  try {
    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { user_id, workspace_role } = req.body;
    const companyId = String(req.params.id);

    const member = await CompanyModel.inviteMember(
      companyId,
      user_id,
      workspace_role,
      actorId,
      req.ip,
    );

    res.status(201).json({
      message: "Member invited successfully",
      member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:id/members
 * Lists all company members and their statuses. Restricted to company members.
 */
export const listCompanyMembers: RequestHandler = async (req, res, next) => {
  try {
    const companyId = String(req.params.id);
    const members = await CompanyModel.listMembers(companyId);
    res.status(200).json({ members });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/companies/:id/members/accept
 * Allows the authenticated user to accept their pending company invitation.
 */
export const acceptMembershipInvite: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const companyId = String(req.params.id);
    const member = await CompanyModel.acceptInvite(companyId, userId, req.ip);

    if (!member) {
      res.status(404).json({
        error: "Not Found",
        message: "No pending invitation found for your user in this company",
      });
      return;
    }

    res.status(200).json({
      message: "Invitation accepted successfully",
      member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/companies/:id/members/:memberId
 * Soft-removes a member, setting status to REMOVED and setting removed_at.
 * Zero hard deletes (PRD §14). Restricted to company ADMINs.
 */
export const removeCompanyMember: RequestHandler = async (req, res, next) => {
  try {
    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const companyId = String(req.params.id);
    const memberId = String(req.params.memberId);
    const member = await CompanyModel.softRemoveMember(
      companyId,
      memberId,
      actorId,
      req.ip,
    );

    if (!member) {
      res.status(404).json({ error: "Not Found", message: "Member not found" });
      return;
    }

    res.status(200).json({
      message: "Member access revoked successfully without deleting records",
      member,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/companies/:id/verifications
 * Submits company verification documents for administrative review (PRD §4.2).
 * Restricted to company ADMINs.
 */
export const submitCompanyVerification: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const companyId = String(req.params.id);
    const verification = await CompanyModel.submitVerification(
      companyId,
      req.body,
      actorId,
      req.ip,
    );

    res.status(201).json({
      message: "Verification documents submitted successfully",
      verification,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:id/verifications
 * Lists verification submission history for the company. Restricted to company members.
 */
export const listCompanyVerifications: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const companyId = String(req.params.id);
    const verifications =
      await CompanyModel.listCompanyVerifications(companyId);
    res.status(200).json({ verifications });
  } catch (error) {
    next(error);
  }
};
