import {
  expertiseLevels,
  getLevel,
  type CareerRole,
  type ExpertiseLevel,
  type Placement,
} from "../data/roles.js";
import type { AssessmentMetrics, AttemptResult, QuestionResult } from "../types/assessment.js";

// Test-score bonus for verifiable evidence of real work (kept small so evidence cannot replace skill).
const evidenceBonus = (metrics: AssessmentMetrics): number =>
  metrics.portfolioUrl ? 6 : metrics.hasShippedWork ? 3 : 0;

// Check a placement level's overall threshold and per-competency minimums.
// Competencies the test did not cover are skipped rather than failed.
function meetsLevel(
  role: CareerRole,
  level: "internship" | "job",
  overall: number,
  scores: Record<string, number>,
): boolean {
  if (overall < role.thresholds[level]) return false;
  return role.coreMins[level].every(
    (min) => scores[min.competencyId] === undefined || scores[min.competencyId] >= min.min,
  );
}

// Turn graded question results plus self-reported metrics into scores and a pool placement.
export function buildResult(
  role: CareerRole,
  level: ExpertiseLevel,
  results: QuestionResult[],
  metrics: AssessmentMetrics,
  durationMins: number,
): AttemptResult {
  const ceiling = getLevel(level).ceiling;
  const bonus = evidenceBonus(metrics);
  const scores: Record<string, number> = {};

  for (const competency of role.competencies) {
    const own = results.filter((result) => result.competencyId === competency.id);
    if (own.length === 0) continue;
    const raw = own.reduce((sum, result) => sum + result.raw, 0) / own.length;
    scores[competency.id] = Math.min(ceiling, Math.round((raw / 100) * ceiling) + (raw > 0 ? bonus : 0));
  }

  const assessed = Object.values(scores);
  const overallScore = assessed.length
    ? Math.round(assessed.reduce((sum, value) => sum + value, 0) / assessed.length)
    : 0;
  const rawAverage = Math.round(
    results.reduce((sum, result) => sum + result.raw, 0) / Math.max(1, results.length),
  );

  const placement: Placement = meetsLevel(role, "job", overallScore, scores)
    ? "job"
    : meetsLevel(role, "internship", overallScore, scores)
      ? "internship"
      : "learning";

  // Demonstrated level drops one step below 70% raw and two below 45%.
  const index = expertiseLevels.findIndex((item) => item.id === level);
  const drop = rawAverage >= 70 ? 0 : rawAverage >= 45 ? 1 : 2;
  const demonstratedIndex = index - drop;
  const demonstratedLevel = demonstratedIndex >= 0 ? expertiseLevels[demonstratedIndex].id : "below-intern";

  const label = (id: string) => role.competencies.find((item) => item.id === id)?.label ?? id;
  const strengths = Object.entries(scores)
    .filter(([, score]) => score >= 70)
    .map(([id, score]) => `${label(id)} (${score})`);
  const gaps = Object.entries(scores)
    .filter(([, score]) => score < 60)
    .flatMap(([id]) => {
      const missed = results.find((result) => result.competencyId === id)?.missed[0];
      return [missed ? `${label(id)}: ${missed}` : label(id)];
    });

  // Self-rated confidence versus measured score highlights over- and under-confidence.
  const confidenceScore = metrics.confidence * 20;
  const calibration =
    confidenceScore - overallScore > 25
      ? " Your confidence is higher than your test score, so revisit the gaps above before applying."
      : overallScore - confidenceScore > 25
        ? " You scored higher than you expected - you are likely more ready than you think."
        : "";

  const recommendedNext =
    placement === "job"
      ? `You meet the bar for ${role.title} jobs. Apply to roles that match your goal.${calibration}`
      : placement === "internship"
        ? `You are ready for ${role.title} internships.${metrics.goal === "job" ? " Build the gaps above to unlock jobs." : ""}${calibration}`
        : `Start with guided learning for ${role.title}${metrics.weeklyHours >= 8 ? ", and with your weekly time you can retake the test soon" : ", pacing it to your weekly time"}.${calibration}`;

  const summary =
    drop === 0
      ? `You demonstrated ${getLevel(level).label.toLowerCase()} ${role.title.toLowerCase()} skills.`
      : `You attempted ${getLevel(level).label}, but your answers are closer to ${demonstratedLevel === "below-intern" ? "foundation" : getLevel(demonstratedLevel).label} level.`;

  return {
    competencyScores: scores,
    questionResults: results,
    rawAverage,
    overallScore,
    demonstratedLevel,
    placement,
    durationMins,
    summary,
    strengths,
    gaps,
    recommendedNext,
  };
}
