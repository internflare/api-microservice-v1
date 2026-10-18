import type { RequestHandler } from "express";
import { CompanyModel } from "../models/company.model.js";

/**
 * GET /api/admin/verifications
 * Lists all pending verification requests across companies for platform administrators.
 */
export const listPendingVerifications: RequestHandler = async (_req, res, next) => {
  try {
    const pending = await CompanyModel.listPendingVerifications();
    res.status(200).json({ pending_verifications: pending });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/verifications/:id/decision
 * Records an approval or rejection decision on a verification request (PRD §4.2).
 * Restricted to platform administrators.
 */
export const decideVerification: RequestHandler = async (req, res, next) => {
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
  } catch (error: any) {
    if (error.message?.includes("not found")) {
      res.status(404).json({ error: "Not Found", message: error.message });
      return;
    }
    if (error.message?.includes("already been decided")) {
      res.status(409).json({ error: "Conflict", message: error.message });
      return;
    }
    next(error);
  }
};
