import type { ExpertiseLevel, Placement } from "../data/roles.js";

export type QuestionKind = "mcq" | "scenario" | "code-review" | "code-write" | "practical";

export interface RubricPoint {
  point: string;
  keywords: string[];
}

export interface CodeCheck {
  label: string;
  pattern: string;
}

// A stored question including its answer key; never sent to clients as-is.
export interface Question {
  id: string;
  roleId: string;
  competencyId: string;
  levels: ExpertiseLevel[];
  kind: QuestionKind;
  title: string;
  prompt: string;
  context?: string | null;
  code?: { lang: string; snippet: string } | null;
  material?: { label: string; rows?: string[][]; text?: string } | null;
  options?: string[] | null;
  answer?: number | null;
  rubric?: RubricPoint[] | null;
  checks?: CodeCheck[] | null;
  starter?: string | null;
  minWords?: number | null;
  timeMins: number;
  tags: string[];
  source: "ai" | "manual";
}

// Question fields safe to show to the talent taking the test.
export type PublicQuestion = Omit<Question, "answer" | "rubric" | "checks" | "source">;

export interface QuestionResponse {
  choice?: number;
  text?: string;
  code?: string;
}

export interface QuestionResult {
  questionId: string;
  competencyId: string;
  kind: string;
  title: string;
  raw: number;
  covered: string[];
  missed: string[];
  summary: string;
}

// Self-reported metrics collected after the test to decide where the talent fits.
export interface AssessmentMetrics {
  goal: "internship" | "job" | "exploring";
  confidence: number;
  weeklyHours: number;
  hasShippedWork: boolean;
  portfolioUrl?: string;
}

export interface ProfileSnapshot {
  skills: string[];
  experienceYears: number;
  experienceTitles: string[];
  preferredRoles: string[];
}

export interface AttemptRecord {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  roleId: string;
  level: ExpertiseLevel;
  status: "in_progress" | "graded" | "completed";
  questionIds: string[];
  profileSnapshot: ProfileSnapshot;
  startedAt: Date;
}

export interface AttemptResult {
  competencyScores: Record<string, number>;
  questionResults: QuestionResult[];
  rawAverage: number;
  overallScore: number;
  demonstratedLevel: ExpertiseLevel | "below-intern";
  placement: Placement;
  durationMins: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendedNext: string;
}
