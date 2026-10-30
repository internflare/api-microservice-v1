import mongoose, { Types } from "mongoose";

// Read-only view of ai-service's `assessment_attempts` collection (same database).
export interface AssessmentAttemptSummary {
  placement: "learning" | "internship" | "job" | null;
  overall_score: number | null;
}

const COMPLETED_STATUSES = ["graded", "completed"];
const PLACEMENT_RANK = { learning: 0, internship: 1, job: 2 } as const;

// Best completed attempt (highest placement, then score) a user has for a role, or null.
async function findBestAttempt(
  userId: string,
  roleId: string,
): Promise<AssessmentAttemptSummary | null> {
  // Ids from the session are ObjectId strings; a malformed id can never have attempts.
  if (!Types.ObjectId.isValid(userId)) return null;
  const attempts = await mongoose.connection
    .collection("assessment_attempts")
    .find(
      { user_id: { $in: [new Types.ObjectId(userId), userId] }, role_id: roleId, status: { $in: COMPLETED_STATUSES } },
      { projection: { placement: 1, overall_score: 1 } },
    )
    .toArray();
  if (attempts.length === 0) return null;

  const rank = (placement: unknown) =>
    PLACEMENT_RANK[placement as keyof typeof PLACEMENT_RANK] ?? -1;
  const best = attempts.reduce((a, b) =>
    rank(b.placement) > rank(a.placement) ||
    (rank(b.placement) === rank(a.placement) &&
      Number(b.overall_score ?? 0) > Number(a.overall_score ?? 0))
      ? b
      : a,
  );
  return {
    placement: rank(best.placement) >= 0 ? best.placement : null,
    overall_score:
      typeof best.overall_score === "number" ? best.overall_score : null,
  };
}

// Records a user's first view of a listing and bumps views_count exactly once per user.
// The unique (opportunity_id, user_id) index makes the upsert the de-duplication point.
async function recordUniqueView(
  opportunityId: string,
  userId: string,
): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId)) return false;
  const opportunityObjectId = new Types.ObjectId(opportunityId);
  const result = await mongoose.connection
    .collection("opportunity_views")
    .updateOne(
      { opportunity_id: opportunityObjectId, user_id: new Types.ObjectId(userId) },
      { $setOnInsert: { created_at: new Date() } },
      { upsert: true },
    );
  if (result.upsertedCount === 0) return false;

  await mongoose.connection
    .collection("opportunities")
    .updateOne({ _id: opportunityObjectId }, { $inc: { views_count: 1 } });
  return true;
}

// Idempotent; run once at startup.
async function ensureViewIndexes(): Promise<void> {
  await mongoose.connection
    .collection("opportunity_views")
    .createIndex({ opportunity_id: 1, user_id: 1 }, { unique: true });
}

export { ensureViewIndexes, findBestAttempt, recordUniqueView };
