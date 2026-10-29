import type { Request, Response, NextFunction } from "express";
import { getUploadedFile, storeFile } from "../services/upload.service.js";
import { UPLOAD_KINDS } from "../validators/upload.validator.js";
import { TalentModel } from "../models/talent.model.js";
import { calculateProfileCompleteness } from "../services/completeness.service.js";
import {
  CreateTalentProfileSchema,
  UpdateTalentProfileSchema,
  TalentSearchQuerySchema,
} from "../validators/talent.validator.js";
import {
  getAuthenticatedUserId,
  parseOrReject,
} from "../validators/request.validator.js";
import { publishWelcomeEmail } from "../services/notification-publisher.service.js";
import { cacheAside, cacheKeys, invalidate } from "../services/cache.service.js";

// A profile change affects the user's own cached profile and the employer talent pool.
const invalidateTalentCaches = (userId: string) =>
  invalidate(cacheKeys.talentProfile(userId), cacheKeys.talentPool);

export class TalentController {
  /**
   * POST /api/v1/talent/profile
   * Create or initialize a talent profile
   */
  static async upsertMyProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const input = parseOrReject(CreateTalentProfileSchema, req.body, res);
      if (!input) return;

      // A CV sent with the submit is stored in R2 here, after the data has validated.
      const cv = getUploadedFile(res, "cv");
      if (cv) input.cv_url = await storeFile(cv, UPLOAD_KINDS.cv, userId);

      const profile = await TalentModel.upsertProfile(userId, input);
      await invalidateTalentCaches(userId);
      const completeness = calculateProfileCompleteness(profile);

      // Onboarding is complete once the profile is saved; welcome email is de-duplicated per user.
      void publishWelcomeEmail(req.user!);

      res.status(200).json({
        success: true,
        data: {
          profile,
          completeness,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/talent/profile/me
   * Retrieve the current authenticated user's talent profile with completeness calculation
   */
  static async getMyProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const profile = await cacheAside(cacheKeys.talentProfile(userId), () =>
        TalentModel.findByUserId(userId),
      );
      if (!profile) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Talent profile has not been created yet.",
          completeness: calculateProfileCompleteness({}),
        });
        return;
      }

      const completeness = calculateProfileCompleteness(profile);

      res.status(200).json({
        success: true,
        data: {
          profile,
          completeness,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/talent/profile/me
   * Partially update talent profile and recalculate completeness
   */
  static async updateMyProfile(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const input = parseOrReject(UpdateTalentProfileSchema, req.body, res);
      if (!input) return;

      const updatedProfile = await TalentModel.updateProfile(userId, input);
      await invalidateTalentCaches(userId);
      const completeness = calculateProfileCompleteness(updatedProfile);

      res.status(200).json({
        success: true,
        data: {
          profile: updatedProfile,
          completeness,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/talent/profile/:id
   * Public profile view (by profile id)
   */
  static async getProfileById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const profile = await TalentModel.findById(id);

      if (!profile) {
        res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Talent profile not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          profile,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/talent/profiles
   * Recruiter / Public talent directory search
   */
  static async searchProfiles(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const query = parseOrReject(
        TalentSearchQuerySchema,
        req.query,
        res,
        "Invalid Query Parameters",
      );
      if (!query) return;

      // skills may arrive as a repeated param (array) or a comma-separated string.
      const skillsArray = query.skills
        ? Array.isArray(query.skills)
          ? query.skills
          : query.skills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
        : undefined;

      const result = await TalentModel.searchTalents({
        skills: skillsArray,
        country: query.country,
        availability: query.availability,
        work_arrangement_pref: query.work_arrangement_pref,
        min_completeness: query.min_completeness,
        limit: query.limit,
        offset: query.offset,
      });

      res.status(200).json({
        success: true,
        data: result.talents,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
