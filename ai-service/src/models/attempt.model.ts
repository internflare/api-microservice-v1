import { randomUUID } from "node:crypto";
import { Schema, Types, model } from "mongoose";
import type { ExpertiseLevel } from "../data/roles.js";
import type {
  AssessmentMetrics,
  AttemptRecord,
  AttemptResult,
  ProfileSnapshot,
  QuestionResponse,
} from "../types/assessment.js";

interface AttemptDocument {
  id: string;
  user_id: Types.ObjectId;
  user_email: string;
  user_name: string | null;
  role_id: string;
  level: ExpertiseLevel;
  status: AttemptRecord["status"];
  question_ids: string[];
  profile_snapshot: ProfileSnapshot;
  started_at: Date;
  graded_at: Date | null;
  responses: Record<string, QuestionResponse> | null;
  metrics: AssessmentMetrics | null;
  question_results: AttemptResult["questionResults"] | null;
  competency_scores: AttemptResult["competencyScores"] | null;
  raw_average: number | null;
  duration_mins: number | null;
  overall_score: number | null;
  demonstrated_level: AttemptResult["demonstratedLevel"] | null;
  placement: AttemptResult["placement"] | null;
  report: unknown;
  completed_at: Date | null;
}

const attemptSchema = new Schema<AttemptDocument>(
  {
    id: { type: String, default: () => randomUUID(), unique: true },
    user_id: { type: Schema.Types.ObjectId, ref: "user", required: true, index: true },
    user_email: { type: String, required: true },
    user_name: { type: String, default: null },
    role_id: { type: String, required: true },
    level: { type: String, required: true },
    status: { type: String, enum: ["in_progress", "graded", "completed"], default: "in_progress" },
    question_ids: { type: [String], required: true },
    profile_snapshot: { type: Schema.Types.Mixed, required: true },
    started_at: { type: Date, default: Date.now },
    graded_at: { type: Date, default: null },
    responses: { type: Schema.Types.Mixed, default: null },
    metrics: { type: Schema.Types.Mixed, default: null },
    question_results: { type: Schema.Types.Mixed, default: null },
    competency_scores: { type: Schema.Types.Mixed, default: null },
    raw_average: { type: Number, default: null },
    duration_mins: { type: Number, default: null },
    overall_score: { type: Number, default: null },
    demonstrated_level: { type: String, default: null },
    placement: { type: String, enum: ["learning", "internship", "job", null], default: null },
    report: { type: Schema.Types.Mixed, default: null },
    completed_at: { type: Date, default: null },
  },
  { collection: "assessment_attempts" },
);

attemptSchema.index({ user_id: 1, started_at: -1 });
const AttemptModel = model<AttemptDocument>("AssessmentAttempt", attemptSchema);

const toAttempt = (row: AttemptDocument): AttemptRecord => ({
  id: row.id,
  userId: String(row.user_id),
  userEmail: row.user_email,
  userName: row.user_name,
  roleId: row.role_id,
  level: row.level,
  status: row.status,
  questionIds: row.question_ids,
  profileSnapshot: row.profile_snapshot,
  startedAt: row.started_at,
});

// Create a new in-progress attempt holding the exact question set shown to the user.
export async function createAttempt(input: {
  userId: string;
  userEmail: string;
  userName: string | null;
  roleId: string;
  level: ExpertiseLevel;
  questionIds: string[];
  profile: ProfileSnapshot;
}): Promise<AttemptRecord> {
  const row = await AttemptModel.create({
    id: randomUUID(),
    user_id: input.userId,
    user_email: input.userEmail,
    user_name: input.userName,
    role_id: input.roleId,
    level: input.level,
    question_ids: input.questionIds,
    profile_snapshot: input.profile,
  });
  return toAttempt(row);
}

// Fetch an attempt only if it belongs to the user.
export async function findAttemptForUser(
  attemptId: string,
  userId: string,
): Promise<(AttemptRecord & { report: unknown }) | null> {
  const row = await AttemptModel.findOne({ id: attemptId, user_id: userId }).lean<AttemptDocument>().exec();
  return row ? { ...toAttempt(row), report: row.report } : null;
}

// Question ids the user has been shown before, so new attempts get fresh questions.
export async function listSeenQuestionIds(userId: string, roleId: string): Promise<string[]> {
  return AttemptModel.distinct("question_ids", { user_id: userId, role_id: roleId }).exec();
}

// Attempts started in the last 24 hours, used for rate limiting.
export async function countRecentAttempts(userId: string): Promise<number> {
  return AttemptModel.countDocuments({
    user_id: userId,
    started_at: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });
}

// Atomically claim an in-progress attempt for grading so double submits cannot both succeed.
export async function claimAttemptForGrading(attemptId: string): Promise<boolean> {
  const result = await AttemptModel.updateOne(
    { id: attemptId, status: "in_progress" },
    { $set: { status: "graded", graded_at: new Date() } },
  );
  return result.modifiedCount > 0;
}

// Return a claimed attempt to in-progress when grading fails so the user can retry.
export async function releaseAttempt(attemptId: string): Promise<void> {
  await AttemptModel.updateOne(
    { id: attemptId, status: "graded", completed_at: null },
    { $set: { status: "in_progress", graded_at: null } },
  );
}

// Persist answers, grading, metrics and placement, and mark the attempt complete.
export async function completeAttempt(
  attemptId: string,
  responses: Record<string, QuestionResponse>,
  metrics: AssessmentMetrics,
  result: AttemptResult,
): Promise<void> {
  await AttemptModel.updateOne(
    { id: attemptId },
    {
      $set: {
        status: "completed",
        completed_at: new Date(),
        responses,
        metrics,
        question_results: result.questionResults,
        competency_scores: result.competencyScores,
        raw_average: result.rawAverage,
        duration_mins: result.durationMins,
        overall_score: result.overallScore,
        demonstrated_level: result.demonstratedLevel,
        placement: result.placement,
        report: result,
      },
    },
  );
}

// A user's completed attempts, newest first.
export async function listCompletedAttempts(userId: string) {
  const rows = await AttemptModel.find({ user_id: userId, status: "completed" })
    .select("id role_id level overall_score placement completed_at")
    .sort({ completed_at: -1 })
    .limit(50)
    .lean<AttemptDocument[]>()
    .exec();
  return rows.map((row) => ({
    id: row.id,
    role_id: row.role_id,
    level: row.level,
    overall_score: row.overall_score,
    placement: row.placement,
    completed_at: row.completed_at,
  }));
}

