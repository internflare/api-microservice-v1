import type { RequestHandler } from "express";
import {
  followCompany,
  getPublicCompanyProfile,
  unfollowCompany,
} from "../services/company-public.service.js";
import { getTalentPool } from "../services/talent-pool.service.js";
import { AppError } from "../utils/appError.js";

/**
 * GET /api/company/:id/public
 * Public company profile with follower count and open roles; `is_following` is set when a viewer is signed in.
 */
export const getPublicCompany: RequestHandler = async (req, res, next) => {
  try {
    const profile = await getPublicCompanyProfile(String(req.params.id), req.user?.id);
    res.status(200).json({ company: profile });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/company/:id/follow
 * Follows the company for the signed-in user (idempotent).
 */
export const followCompanyHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user?.id) throw new AppError("Authentication is required", 401);
    await followCompany(String(req.params.id), req.user.id);
    res.status(200).json({ message: "Company followed", is_following: true });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/company/:id/follow
 * Stops following the company (idempotent).
 */
export const unfollowCompanyHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user?.id) throw new AppError("Authentication is required", 401);
    await unfollowCompany(String(req.params.id), req.user.id);
    res.status(200).json({ message: "Company unfollowed", is_following: false });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/company/:id/talent-pool
 * Job-ready talent from completed assessments. Restricted to active company members.
 */
export const getCompanyTalentPool: RequestHandler = async (_req, res, next) => {
  try {
    res.status(200).json(await getTalentPool());
  } catch (error) {
    next(error);
  }
};
