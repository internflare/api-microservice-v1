import { careerRoles, type CareerRole, type ExpertiseLevel } from "../data/roles.js";
import type { ProfileSnapshot } from "../types/assessment.js";

// Subset of the profile-service talent profile this service relies on.
export interface TalentProfile {
  skills?: unknown;
  experience?: unknown;
  preferred_roles?: unknown;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

// Total experience in years from dated entries; undated entries count as half a year each.
export function estimateExperienceYears(experience: unknown): number {
  if (!Array.isArray(experience)) return 0;
  let months = 0;
  for (const entry of experience as Record<string, unknown>[]) {
    const start = typeof entry.start_date === "string" ? Date.parse(entry.start_date) : NaN;
    const end =
      entry.current || typeof entry.end_date !== "string"
        ? Date.now()
        : Date.parse(entry.end_date);
    months +=
      Number.isFinite(start) && Number.isFinite(end) && end > start
        ? (end - start) / (1000 * 60 * 60 * 24 * 30.44)
        : 6;
  }
  return Math.round((months / 12) * 10) / 10;
}

// Map experience to the difficulty tier used for question selection and score ceilings.
export function levelFromYears(years: number): ExpertiseLevel {
  if (years < 0.5) return "intern";
  if (years < 2) return "junior";
  if (years < 5) return "mid";
  return "senior";
}

// Build the snapshot stored with each attempt.
export function snapshotProfile(profile: TalentProfile): ProfileSnapshot {
  const experience = Array.isArray(profile.experience) ? (profile.experience as Record<string, unknown>[]) : [];
  return {
    skills: strings(profile.skills),
    experienceYears: estimateExperienceYears(profile.experience),
    experienceTitles: experience.flatMap((entry) => (typeof entry.title === "string" ? [entry.title] : [])),
    preferredRoles: strings(profile.preferred_roles),
  };
}

// Pick the best-matching role: preferred roles weigh most, then experience titles, then skills.
export function inferRole(snapshot: ProfileSnapshot): CareerRole | undefined {
  const scoreFor = (role: CareerRole): number => {
    const hits = (text: string) =>
      role.keywords.some((keyword) => text.toLowerCase().includes(keyword)) ||
      text.toLowerCase().includes(role.title.toLowerCase());
    return (
      snapshot.preferredRoles.filter(hits).length * 3 +
      snapshot.experienceTitles.filter(hits).length * 2 +
      snapshot.skills.filter(hits).length
    );
  };
  const ranked = careerRoles
    .map((role) => ({ role, score: scoreFor(role) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.role;
}
