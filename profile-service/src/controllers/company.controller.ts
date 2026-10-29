import type { RequestHandler } from "express";
import { CompanyModel } from "../models/company.model.js";
import { requireAdminCompanyId } from "../validators/company-access.validator.js";
import { getAuthenticatedUserId as getUserId } from "../validators/request.validator.js";
import { publishWelcomeEmail } from "../services/notification-publisher.service.js";
import { sendTeamInvites } from "../services/team-invite.service.js";
import { invalidateCompanyPublic } from "../services/company-public.service.js";
import { AppError } from "../utils/appError.js";
import { getUploadedFile, storeFile } from "../services/upload.service.js";
import { UPLOAD_KINDS } from "../validators/upload.validator.js";

// Company endpoints use this 401 body rather than the talent one.
const getAuthenticatedUserId = (
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): string | undefined =>
  getUserId(req, res, {
    error: "Unauthorized",
    message: "Authentication required",
  });

/**
 * POST /api/companies
 * Creates a new company and atomically registers the creator as an ACTIVE ADMIN.
 */
export const createCompany: RequestHandler = async (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

    // Files sent with the submit are stored in R2 now that the data has validated.
    const logo = getUploadedFile(res, "logo");
    const cac = getUploadedFile(res, "cac_document");
    const companyInput = { ...req.body };
    if (logo) companyInput.logo_url = await storeFile(logo, UPLOAD_KINDS.logo, userId);
    const cacUrl = cac ? await storeFile(cac, UPLOAD_KINDS.cac_document, userId) : null;

    const newCompany = await CompanyModel.createCompanyWithAdmin(
      companyInput,
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

    // The CAC certificate goes straight into the verification queue for admin review.
    if (cacUrl) {
      try {
        await CompanyModel.submitVerification(
          company.id,
          {
            registration_number: companyInput.registration_number ?? undefined,
            documents: [
              {
                title: "CAC registration certificate",
                url: cacUrl,
                document_type: "CAC",
                uploaded_at: new Date().toISOString(),
              },
            ],
          },
          userId,
          req.ip,
        );
      } catch (verificationError) {
        console.error("[profile-service] CAC verification submit failed:", verificationError);
      }
    }

    // Employer onboarding is complete once the company exists; welcome email is de-duplicated per user.
    void publishWelcomeEmail(req.user!);

    // Team invites are best-effort: failures are logged and never fail onboarding.
    if (companyInput.invites?.length) {
      void sendTeamInvites(
        { id: company.id, name: company.name },
        companyInput.invites,
        { id: userId, name: req.user?.name ?? "A teammate" },
      );
    }

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
 * GET /api/companies/mine
 * Lists the companies the authenticated user actively administers.
 */
export const listMyAdminCompanies: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError("Authentication is required", 401);
    }

    const companies =
      await CompanyModel.listActiveAdminCompaniesForUser(userId);
    res.status(200).json({ companies });
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
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

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

    await invalidateCompanyPublic(companyId);

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
    const actorId = getAuthenticatedUserId(req, res);
    if (!actorId) return;

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
 * POST /api/companies/:id/invites
 * Emails signup links to new teammates. Restricted to company ADMINs.
 * Responds 207-style: 201 with per-address results so the UI can show partial failures.
 */
export const inviteTeamMembers: RequestHandler = async (req, res, next) => {
  try {
    const actorId = getAuthenticatedUserId(req, res);
    if (!actorId) return;

    const company = await CompanyModel.findCompanyById(String(req.params.id));
    if (!company) {
      res.status(404).json({ error: "Not Found", message: "Company not found" });
      return;
    }

    const results = await sendTeamInvites(
      { id: company.id, name: company.name },
      req.body.invites,
      { id: actorId, name: req.user?.name ?? "A teammate" },
    );
    const failed = results.filter((result) => !result.sent);
    if (failed.length === results.length) {
      res.status(502).json({ error: "Bad Gateway", message: "Could not send the invitations", results });
      return;
    }
    res.status(201).json({ message: "Invitations sent", results });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/companies/:id/members
 * Lists all company members and their statuses. Restricted to company members.
 */
const listCompanyMembers: RequestHandler = async (req, res, next) => {
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
    const userId = getAuthenticatedUserId(req, res);
    if (!userId) return;

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
    const actorId = getAuthenticatedUserId(req, res);
    if (!actorId) return;

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
    const actorId = getAuthenticatedUserId(req, res);
    if (!actorId) return;

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
const listCompanyVerifications: RequestHandler = async (req, res, next) => {
  try {
    const companyId = String(req.params.id);
    const verifications =
      await CompanyModel.listCompanyVerifications(companyId);
    res.status(200).json({ verifications });
  } catch (error) {
    next(error);
  }
};

/**
 * Lists the jobs posted by the company the user administers.
 * Currently limited to admins, which may be widened to other members later.
 */
const listAllPostedJobs: RequestHandler = async (req, res, next) => {
  try {
    const companyId = await requireAdminCompanyId(req);

    // Fetch and return the company's posted jobs
    const metrics = await CompanyModel.listAllPostedJobs(companyId);
    res.status(200).json({ metrics });
  } catch (error) {
    next(error);
  }
};

export { listCompanyMembers, listCompanyVerifications, listAllPostedJobs };
