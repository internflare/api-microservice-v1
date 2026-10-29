import mongoose from "mongoose";
import { TalentProfileDocument } from "./talent.schema.js";
import { calculateProfileCompleteness } from "../services/completeness.service.js";
import type { TalentProfile, TalentProfileInput, TalentSearchQuery } from "../types/talent.types.js";

function mapDocumentToTalentProfile(document: any): TalentProfile {
  const row = typeof document.toObject === "function" ? document.toObject() : document;
  const dateToIso = (value: unknown) => new Date(value as string | number | Date).toISOString();
  return {
    id: String(row.id ?? row._id),
    user_id: row.user_id,
    full_name: row.full_name ?? null,
    phone: row.phone ?? null,
    country: row.country ?? null,
    location: row.location ?? null,
    headline: row.headline ?? null,
    education: Array.isArray(row.education) ? row.education : [],
    experience: Array.isArray(row.experience) ? row.experience : [],
    skills: Array.isArray(row.skills) ? row.skills : [],
    preferred_roles: Array.isArray(row.preferred_roles) ? row.preferred_roles : [],
    availability: row.availability ?? null,
    work_arrangement_pref: row.work_arrangement_pref ?? null,
    career_goals: row.career_goals ?? null,
    cv_url: row.cv_url ?? null,
    avatar_url: row.avatar_url ?? null,
    profile_completeness: Number(row.profile_completeness ?? 0),
    readiness_score: Number(row.readiness_score ?? 0),
    created_at: dateToIso(row.created_at),
    updated_at: dateToIso(row.updated_at),
  };
}

export class TalentModel {
  static async findByUserId(userId: string): Promise<TalentProfile | null> {
    const profile = await TalentProfileDocument.findOne({ user_id: userId }).lean();
    return profile ? mapDocumentToTalentProfile(profile) : null;
  }

  static async findById(id: string): Promise<TalentProfile | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    const profile = await TalentProfileDocument.findById(id).lean();
    return profile ? mapDocumentToTalentProfile(profile) : null;
  }

  static async upsertProfile(userId: string, data: TalentProfileInput): Promise<TalentProfile> {
    const completeness = calculateProfileCompleteness(data);
    const set: Record<string, unknown> = {
      full_name: data.full_name ?? null,
      phone: data.phone ?? null,
      country: data.country ?? null,
      location: data.location ?? null,
      headline: data.headline ?? null,
      education: data.education ?? [],
      experience: data.experience ?? [],
      skills: data.skills ?? [],
      preferred_roles: data.preferred_roles ?? [],
      availability: data.availability ?? null,
      work_arrangement_pref: data.work_arrangement_pref ?? null,
      career_goals: data.career_goals ?? null,
      profile_completeness: completeness.score,
    };
    // Insert-time defaults must not touch paths already in $set (Mongo rejects the conflict).
    const setOnInsert: Record<string, unknown> = { readiness_score: 0 };
    if (data.cv_url != null) set.cv_url = data.cv_url;
    else setOnInsert.cv_url = null;
    if (data.avatar_url != null) set.avatar_url = data.avatar_url;
    else setOnInsert.avatar_url = null;
    const profile = await TalentProfileDocument.findOneAndUpdate(
      { user_id: userId },
      { $set: set, $setOnInsert: setOnInsert },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean();
    return mapDocumentToTalentProfile(profile);
  }

  static async updateProfile(userId: string, patch: Partial<TalentProfileInput>): Promise<TalentProfile> {
    const existing = await this.findByUserId(userId);
    if (!existing) return this.upsertProfile(userId, patch);
    const mergedData: TalentProfileInput = {
      full_name: patch.full_name !== undefined ? patch.full_name : existing.full_name,
      phone: patch.phone !== undefined ? patch.phone : existing.phone,
      country: patch.country !== undefined ? patch.country : existing.country,
      location: patch.location !== undefined ? patch.location : existing.location,
      headline: patch.headline !== undefined ? patch.headline : existing.headline,
      education: patch.education !== undefined ? patch.education : existing.education,
      experience: patch.experience !== undefined ? patch.experience : existing.experience,
      skills: patch.skills !== undefined ? patch.skills : existing.skills,
      preferred_roles: patch.preferred_roles !== undefined ? patch.preferred_roles : existing.preferred_roles,
      availability: patch.availability !== undefined ? patch.availability : existing.availability,
      work_arrangement_pref: patch.work_arrangement_pref !== undefined ? patch.work_arrangement_pref : existing.work_arrangement_pref,
      career_goals: patch.career_goals !== undefined ? patch.career_goals : existing.career_goals,
      cv_url: patch.cv_url !== undefined ? patch.cv_url : existing.cv_url,
      avatar_url: patch.avatar_url !== undefined ? patch.avatar_url : existing.avatar_url,
    };
    return this.upsertProfile(userId, mergedData);
  }

  static async searchTalents(query: TalentSearchQuery): Promise<{ talents: TalentProfile[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.skills?.length) filter.skills = { $in: query.skills };
    if (query.country) filter.country = { $regex: `^${escapeRegex(query.country)}$`, $options: "i" };
    if (query.availability) filter.availability = query.availability;
    if (query.work_arrangement_pref) filter.work_arrangement_pref = query.work_arrangement_pref;
    if (query.min_completeness !== undefined) filter.profile_completeness = { $gte: query.min_completeness };
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const [total, rows] = await Promise.all([
      TalentProfileDocument.countDocuments(filter),
      TalentProfileDocument.find(filter)
        .sort({ profile_completeness: -1, created_at: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);
    return { talents: rows.map(mapDocumentToTalentProfile), total };
  }

  static async deleteByUserId(userId: string): Promise<boolean> {
    const result = await TalentProfileDocument.deleteOne({ user_id: userId });
    return result.deletedCount > 0;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
