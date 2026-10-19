import type { Request, Response, NextFunction } from "express";
import { TalentModel } from "../models/talent.model.js";
import { calculateProfileCompleteness } from "../services/completeness.service.js";
import {
  CreateTalentProfileSchema,
  UpdateTalentProfileSchema,
  TalentSearchQuerySchema,
} from "../validators/talent.validator.js";

export class TalentController {
  /**
   * POST /api/v1/talent/profile
   * Create or initialize a talent profile
   */
  static async upsertMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const parseResult = CreateTalentProfileSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          details: parseResult.error.flatten(),
        });
        return;
      }

      const profile = await TalentModel.upsertProfile(userId, parseResult.data);
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
   * GET /api/v1/talent/profile/me
   * Retrieve the current authenticated user's talent profile with completeness calculation
   */
  static async getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const profile = await TalentModel.findByUserId(userId);
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
  static async updateMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      const parseResult = UpdateTalentProfileSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: "Validation Error",
          details: parseResult.error.flatten(),
        });
        return;
      }

      const updatedProfile = await TalentModel.updateProfile(userId, parseResult.data);
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
   * Public profile view (by profile UUID)
   */
  static async getProfileById(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  static async searchProfiles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = TalentSearchQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: "Invalid Query Parameters",
          details: parseResult.error.flatten(),
        });
        return;
      }

      const query = parseResult.data;
      const skillsArray = query.skills
        ? Array.isArray(query.skills)
          ? query.skills
          : query.skills.split(",").map((s) => s.trim()).filter(Boolean)
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
