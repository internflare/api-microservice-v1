import mongoose, { Schema } from "mongoose";
import { TalentProfileDocument } from "../models/talent.schema.js";
import { cacheAside, cacheKeys } from "./cache.service.js";

// ai-service owns this collection; it is read-only here and never written.
const AttemptReadModel =
  mongoose.models.AssessmentAttemptRead ??
  mongoose.model("AssessmentAttemptRead", new Schema({}, { collection: "assessment_attempts", strict: false }));

// ai-service writes cannot invalidate this cache, so a short TTL bounds staleness.
const TALENT_POOL_TTL_SECONDS = 120;
const MAX_ATTEMPTS_SCANNED = 5000;

export interface PoolTalent {
  id: string;
  full_name: string;
  headline: string | null;
  location: string | null;
  avatar_url: string | null;
  skills: string[];
  availability: string | null;
  work_arrangement_pref: string | null;
  role_id: string;
  level: string | null;
  overall_score: number;
  demonstrated_level: string | null;
  competency_scores: Record<string, number>;
  strengths: string[];
  summary: string | null;
  portfolio_url: string | null;
  has_shipped_work: boolean;
  completed_at: string | null;
}

export interface TalentPool {
  talent: PoolTalent[];
  routed_count: number;
  generated_at: string;
}

async function loadTalentPool(): Promise<TalentPool> {
  const attempts: any[] = await AttemptReadModel.find({
    status: { $in: ["graded", "completed"] },
    placement: { $ne: null },
  })
    .sort({ completed_at: -1 })
    .limit(MAX_ATTEMPTS_SCANNED)
    .select(
      "user_id user_name role_id level overall_score demonstrated_level competency_scores placement completed_at metrics report.summary report.strengths",
    )
    .lean();

  // Newest attempt per (user, role) wins; earlier ones are superseded.
  const latest = new Map<string, any>();
  for (const attempt of attempts) {
    const key = `${attempt.user_id}:${attempt.role_id}`;
    if (!latest.has(key)) latest.set(key, attempt);
  }
  const current = [...latest.values()];
  const jobReady = current.filter((attempt) => attempt.placement === "job");

  const profiles: any[] = await TalentProfileDocument.find({
    user_id: { $in: [...new Set(jobReady.map((attempt) => attempt.user_id))] },
  }).lean();
  const profileByUser = new Map(profiles.map((profile) => [profile.user_id, profile]));

  const talent: PoolTalent[] = jobReady.flatMap((attempt) => {
    const profile = profileByUser.get(attempt.user_id);
    // Talent without a profile cannot be shown or contacted meaningfully.
    if (!profile) return [];
    return [
      {
        id: `${profile._id}:${attempt.role_id}`,
        full_name: profile.full_name ?? attempt.user_name ?? "Talent",
        headline: profile.headline ?? null,
        location: profile.location ?? profile.country ?? null,
        avatar_url: profile.avatar_url ?? null,
        skills: profile.skills ?? [],
        availability: profile.availability ?? null,
        work_arrangement_pref: profile.work_arrangement_pref ?? null,
        role_id: attempt.role_id,
        level: attempt.level ?? null,
        overall_score: Number(attempt.overall_score ?? 0),
        demonstrated_level: attempt.demonstrated_level ?? null,
        competency_scores: attempt.competency_scores ?? {},
        strengths: attempt.report?.strengths ?? [],
        summary: attempt.report?.summary ?? null,
        portfolio_url: attempt.metrics?.portfolioUrl || null,
        has_shipped_work: Boolean(attempt.metrics?.hasShippedWork),
        completed_at: attempt.completed_at ? new Date(attempt.completed_at).toISOString() : null,
      },
    ];
  });

  talent.sort((a, b) => b.overall_score - a.overall_score);
  return {
    talent,
    routed_count: current.length - jobReady.length,
    generated_at: new Date().toISOString(),
  };
}

export const getTalentPool = (): Promise<TalentPool> =>
  cacheAside(cacheKeys.talentPool, loadTalentPool, TALENT_POOL_TTL_SECONDS);
