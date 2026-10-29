import type { OpportunityRecord } from "../models/opportunity.model.js";
import { findBestAttempt } from "../models/opportunity-view.model.js";

export type EligibilityState =
  | "eligible"
  | "not-assessed"
  | "not-eligible"
  | "unconfigured"
  | "closed";

export interface EligibilityResult {
  state: EligibilityState;
  role_id: string | null;
  required_placement: "internship" | "job";
  placement: string | null;
  overall_score: number | null;
}

// Internship listings accept an internship or job placement; everything else needs "job".
const requiredPlacementFor = (opportunity: OpportunityRecord) =>
  opportunity.opportunity_type.toLowerCase() === "internship"
    ? "internship"
    : "job";

const isClosed = (opportunity: OpportunityRecord): boolean =>
  opportunity.status !== "published" ||
  (opportunity.application_deadline !== null &&
    new Date(opportunity.application_deadline).getTime() < Date.now());

// Decides whether a talent may apply, based on their stored assessment for the listing's role.
async function checkEligibility(
  opportunity: OpportunityRecord,
  userId: string,
): Promise<EligibilityResult> {
  const required = requiredPlacementFor(opportunity);
  const base = {
    role_id: opportunity.role_id ?? null,
    required_placement: required,
    placement: null,
    overall_score: null,
  } as const;

  if (isClosed(opportunity)) return { ...base, state: "closed" };
  if (!opportunity.role_id) return { ...base, state: "unconfigured" };

  const attempt = await findBestAttempt(userId, opportunity.role_id);
  if (!attempt) return { ...base, state: "not-assessed" };

  const meetsPlacement =
    attempt.placement === "job" ||
    (required === "internship" && attempt.placement === "internship");
  return {
    ...base,
    state: meetsPlacement ? "eligible" : "not-eligible",
    placement: attempt.placement,
    overall_score: attempt.overall_score,
  };
}

export { checkEligibility };
