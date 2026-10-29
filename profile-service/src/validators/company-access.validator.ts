import type { Request, Response } from "express";
import { CompanyModel } from "../models/company.model.js";
import { AppError } from "../utils/appError.js";

// Returns the company id the user actively administers, or null.
export const isCompanyAdmin = (userId: string) =>
  CompanyModel.isCompanyAdmin(userId);

// Resolve the company the request's user administers, or throw 401/403.
// Shared by every endpoint that serves company-admin-only data.
export const requireAdminCompanyId = async (req: Request): Promise<string> => {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError("Authentication is required", 401);
  }

  const companyId = await isCompanyAdmin(userId);
  if (!companyId) {
    throw new AppError("Active company administrator access required", 403);
  }
  return companyId;
};

// Look up a company; sends the shared 404 response and returns null when it does not exist.
export const findCompanyOrRespond404 = async (
  companyId: string,
  res: Response,
) => {
  const company = await CompanyModel.findCompanyById(companyId);
  if (!company) {
    res.status(404).json({ error: "Not Found", message: "Company not found" });
    return null;
  }
  return company;
};
