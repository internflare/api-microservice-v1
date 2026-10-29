import type { Request } from "express";
import { config } from "../config.js";
import { getLevel, getRole, type CareerRole, type ExpertiseLevel } from "../data/roles.js";
import {
  claimAttemptForGrading,
  completeAttempt,
  countRecentAttempts,
  createAttempt,
  findAttemptForUser,
  listSeenQuestionIds,
  releaseAttempt,
} from "../models/attempt.model.js";
import { getQuestionsByIds, toPublicQuestion } from "../models/question.model.js";
import type { AssessmentMetrics, QuestionResponse } from "../types/assessment.js";
import { AppError } from "../utils/appError.js";
import { gradeResponse } from "./grading.service.js";
import { publishAssessmentCompleted } from "./notification-publisher.service.js";
import { buildResult } from "./placement.service.js";
import { fetchTalentProfile } from "./profile-client.service.js";
import {
  inferRole,
  levelFromYears,
  snapshotProfile,
} from "./profile-inference.service.js";
import { selectQuestions } from "./question-bank.service.js";

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
}

// Work out the suggested role and level from the talent's saved skills and experience.
export async function getSuggestion(req: Request) {
  const snapshot = snapshotProfile(await fetchTalentProfile(req));
  return {
    suggested_role_id: inferRole(snapshot)?.id ?? null,
    suggested_level: levelFromYears(snapshot.experienceYears),
    profile: snapshot,
  };
}

// Start an assessment: infer role/level from the profile, pick fresh questions, store the attempt.
export async function startAssessment(
  req: Request,
  user: SessionUser,
  overrides: { roleId?: string; level?: ExpertiseLevel },
) {
  if ((await countRecentAttempts(user.id)) >= config.maxAttemptsPerDay) {
    throw new AppError("Daily assessment limit reached. Try again tomorrow.", 429);
  }

  const snapshot = snapshotProfile(await fetchTalentProfile(req));
  let role: CareerRole | undefined = overrides.roleId ? getRole(overrides.roleId) : inferRole(snapshot);
  if (overrides.roleId && !role) throw new AppError("Unknown role_id", 400);
  if (!role) {
    throw new AppError(
      "Could not infer a role from your profile. Pass role_id or add skills and preferred roles.",
      422,
    );
  }
  const level = overrides.level ?? levelFromYears(snapshot.experienceYears);

  const seen = await listSeenQuestionIds(user.id, role.id);
  const questions = await selectQuestions(role, level, user.id, seen, snapshot);
  if (questions.length === 0) {
    throw new AppError("No assessment questions are available for this role yet", 503);
  }

  const attempt = await createAttempt({
    userId: user.id,
    userEmail: user.email,
    userName: user.name ?? null,
    roleId: role.id,
    level,
    questionIds: questions.map((question) => question.id),
    profile: snapshot,
  });

  return {
    attempt_id: attempt.id,
    role: { id: role.id, title: role.title, is_developer: role.isDeveloper },
    level,
    total_mins: questions.reduce((sum, question) => sum + question.timeMins, 0),
    questions: questions.map(toPublicQuestion),
  };
}

// Grade a submission, decide the pool placement, store everything and queue the result email.
export async function submitAssessment(
  user: SessionUser,
  attemptId: string,
  responses: Record<string, QuestionResponse>,
  metrics: AssessmentMetrics,
) {
  const attempt = await findAttemptForUser(attemptId, user.id);
  if (!attempt) throw new AppError("Assessment not found", 404);
  if (attempt.status !== "in_progress") throw new AppError("This assessment was already submitted", 409);

  const unknown = Object.keys(responses).filter((id) => !attempt.questionIds.includes(id));
  if (unknown.length > 0) throw new AppError("Responses reference questions outside this assessment", 400);

  // Claim before the slow AI grading so a double submit cannot grade (and email) twice.
  if (!(await claimAttemptForGrading(attempt.id))) {
    throw new AppError("This assessment was already submitted", 409);
  }

  try {
    const role = getRole(attempt.roleId)!;
    const questions = await getQuestionsByIds(attempt.questionIds);
    const results = await Promise.all(
      questions.map((question) => gradeResponse(question, responses[question.id])),
    );
    const durationMins = Math.max(1, Math.ceil((Date.now() - attempt.startedAt.getTime()) / 60_000));
    const result = buildResult(role, attempt.level, results, metrics, durationMins);

    await completeAttempt(attempt.id, responses, metrics, result);

    const emailQueued = await publishAssessmentCompleted({
      attemptId: attempt.id,
      user: { id: user.id, name: user.name ?? "", email: user.email },
      assessment: {
        roleTitle: role.title,
        levelLabel: getLevel(attempt.level).label,
        overallScore: result.overallScore,
        placement: result.placement,
        demonstratedLevel: result.demonstratedLevel,
        summary: result.summary,
        strengths: result.strengths,
        gaps: result.gaps,
        recommendedNext: result.recommendedNext,
      },
    });

    return { attempt_id: attempt.id, role_id: role.id, level: attempt.level, email_queued: emailQueued, ...result };
  } catch (error) {
    await releaseAttempt(attempt.id).catch(() => undefined);
    throw error;
  }
}

// Return a stored attempt result (or the in-progress state) for its owner.
export async function getAttempt(user: SessionUser, attemptId: string) {
  const attempt = await findAttemptForUser(attemptId, user.id);
  if (!attempt) throw new AppError("Assessment not found", 404);
  return {
    attempt_id: attempt.id,
    role_id: attempt.roleId,
    level: attempt.level,
    status: attempt.status,
    result: attempt.report ?? null,
  };
}
