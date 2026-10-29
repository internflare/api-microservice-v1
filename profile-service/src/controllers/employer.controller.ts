import type { RequestHandler } from "express";
import { CompanyModel } from "../models/company.model.js";
import { requireAdminCompanyId } from "../validators/company-access.validator.js";

/**
 * GET /api/v1/employers/verifications
 * Lists all pending verification requests across companies for platform administrators.
 */
const listPendingVerifications: RequestHandler = async (_req, res, next) => {
  try {
    const pending = await CompanyModel.listPendingVerifications();

    // If there are no pending verifications, return an empty array
    if (!pending || pending.length === 0) {
      res.status(200).json({ pending_verifications: [] });
      return;
    }

    res.status(200).json({ pending_verifications: pending });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/employers/verifications/:id/decision
 * Records an approval or rejection decision on a verification request (PRD §4.2).
 * Restricted to platform administrators.
 */
const decideVerification: RequestHandler = async (req, res, next) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const verificationId = String(req.params.id);
    const result = await CompanyModel.decideVerification(
      verificationId,
      req.body,
      adminId,
      req.ip,
    );

    res.status(200).json({
      message: `Verification decision recorded: ${req.body.status}`,
      verification: result.verification,
      company: result.company,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/employers/dashboard
const getAdminDashboardMetrics: RequestHandler = async (req, res, next) => {
  try {
    const companyId = await requireAdminCompanyId(req);

    // Fetch and return the dashboard metrics
    const metrics = await CompanyModel.getAdminDashboardMetrics(companyId);
    res.status(200).json({ metrics });
  } catch (error) {
    next(error);
  }
};

export {
  listPendingVerifications,
  decideVerification,
  getAdminDashboardMetrics,
};
