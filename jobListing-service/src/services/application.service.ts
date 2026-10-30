import mongoose, { Types } from "mongoose";
import type { OpportunityRecord } from "../models/opportunity.model.js";
import type {
  ApplicationRecord,
  MatchFactor,
} from "../models/application.model.js";
import type { EligibilityResult } from "./eligibility.service.js";

const TALENT_EDITABLE_STAGES = ["New", "Reviewed", "Shortlisted"];

// Talent may edit until the employer requests an interview (any interview record locks it).
export const isTalentEditable = (stage: string, interviewCount: number): boolean =>
  TALENT_EDITABLE_STAGES.includes(stage) && interviewCount === 0;

export interface ApplicantProfile {
  user_id: string;
  full_name: string | null;
  headline: string | null;
  location: string | null;
  country: string | null;
  skills: string[];
  education: Array<Record<string, unknown>>;
  experience: Array<Record<string, unknown>>;
  availability: string | null;
  phone: string | null;
  career_goals: string | null;
  avatar_url: string | null;
  cv_url: string | null;
  profile_completeness: number;
}

const toApplicantProfile = (doc: Record<string, any>): ApplicantProfile => ({
  user_id: String(doc.user_id),
  full_name: doc.full_name ?? null,
  headline: doc.headline ?? null,
  location: doc.location ?? null,
  country: doc.country ?? null,
  skills: Array.isArray(doc.skills) ? doc.skills : [],
  education: Array.isArray(doc.education) ? doc.education : [],
  experience: Array.isArray(doc.experience) ? doc.experience : [],
  availability: doc.availability ?? null,
  phone: doc.phone ?? null,
  career_goals: doc.career_goals ?? null,
  avatar_url: doc.avatar_url ?? null,
  cv_url: doc.cv_url ?? null,
  profile_completeness: Number(doc.profile_completeness ?? 0),
});

// Profiles are owned by profile-service; user_id may still be a string on unmigrated rows.
async function loadApplicantProfiles(
  userIds: string[],
): Promise<Map<string, ApplicantProfile>> {
  const valid = [...new Set(userIds)].filter((id) => Types.ObjectId.isValid(id));
  if (valid.length === 0) return new Map();
  const docs = await mongoose.connection
    .collection("talentprofiles")
    .find({
      user_id: { $in: [...valid.map((id) => new Types.ObjectId(id)), ...valid] },
    })
    .toArray();
  return new Map(
    docs.map((doc) => [String(doc.user_id), toApplicantProfile(doc)]),
  );
}

const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(value)));

// Transparent, deterministic match: assessment result, skill overlap and profile completeness.
// Weights are renormalised over the factors that can actually be computed.
function computeMatch(
  opportunity: OpportunityRecord,
  eligibility: EligibilityResult,
  profile: ApplicantProfile | null,
): { score: number | null; factors: MatchFactor[] } {
  const weighted: Array<{ factor: MatchFactor; weight: number }> = [];

  if (eligibility.overall_score !== null) {
    weighted.push({
      weight: 50,
      factor: {
        label: "Assessment readiness",
        score: clampScore(eligibility.overall_score),
        note: `Overall score ${eligibility.overall_score} (${eligibility.placement ?? "assessed"} placement) in the required role assessment.`,
      },
    });
  }

  const required = (opportunity.skills_required ?? []).map((skill) =>
    skill.trim().toLowerCase(),
  );
  if (required.length > 0 && profile) {
    const owned = new Set(profile.skills.map((skill) => skill.trim().toLowerCase()));
    const matched = required.filter((skill) => owned.has(skill));
    weighted.push({
      weight: 35,
      factor: {
        label: "Skills match",
        score: clampScore((matched.length / required.length) * 100),
        note: `${matched.length} of ${required.length} required skills listed on the profile.`,
      },
    });
  }

  if (profile) {
    weighted.push({
      weight: 15,
      factor: {
        label: "Profile completeness",
        score: clampScore(profile.profile_completeness),
        note: `Profile is ${clampScore(profile.profile_completeness)}% complete.`,
      },
    });
  }

  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return { score: null, factors: [] };
  const score = clampScore(
    weighted.reduce((sum, item) => sum + item.factor.score * item.weight, 0) /
      totalWeight,
  );
  return { score, factors: weighted.map((item) => item.factor) };
}

// Employer-facing application row: the stored application plus applicant profile and listing title.
function toEmployerApplication(
  application: ApplicationRecord,
  profile: ApplicantProfile | undefined,
  listingTitle: string | undefined,
  applicantName?: string,
  contactEmail?: string | null,
) {
  return {
    ...application,
    listing_title: listingTitle ?? null,
    applicant: {
      id: application.talent_id,
      name: profile?.full_name ?? applicantName ?? "Applicant",
      email: contactEmail ?? null,
      phone: profile?.phone ?? null,
      career_goals: profile?.career_goals ?? null,
      headline: profile?.headline ?? null,
      location: profile?.location ?? profile?.country ?? null,
      skills: profile?.skills ?? [],
      education: profile?.education ?? [],
      experience: profile?.experience ?? [],
      availability: profile?.availability ?? null,
      avatar_url: profile?.avatar_url ?? null,
    },
  };
}

export {
  computeMatch,
  loadApplicantProfiles,
  toEmployerApplication,
};
