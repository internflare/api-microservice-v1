import { createHash, randomUUID } from "node:crypto";
import { Schema, model } from "mongoose";
import type { ExpertiseLevel } from "../data/roles.js";
import type { PublicQuestion, Question } from "../types/assessment.js";

interface QuestionDocument {
  id: string;
  role_id: string;
  competency_id: string;
  levels: ExpertiseLevel[];
  kind: Question["kind"];
  title: string;
  prompt: string;
  context: string | null;
  code: Question["code"];
  material: Question["material"];
  options: string[] | null;
  answer: number | null;
  rubric: Question["rubric"];
  checks: Question["checks"];
  starter: string | null;
  min_words: number | null;
  time_mins: number;
  tags: string[];
  source: Question["source"];
  content_hash: string;
  times_served: number;
}

const questionSchema = new Schema<QuestionDocument>(
  {
    id: { type: String, default: () => randomUUID(), unique: true },
    role_id: { type: String, required: true, index: true },
    competency_id: { type: String, required: true, index: true },
    levels: { type: [String], required: true },
    kind: { type: String, required: true },
    title: { type: String, required: true },
    prompt: { type: String, required: true },
    context: { type: String, default: null },
    code: { type: Schema.Types.Mixed, default: null },
    material: { type: Schema.Types.Mixed, default: null },
    options: { type: [String], default: null },
    answer: { type: Number, default: null },
    rubric: { type: Schema.Types.Mixed, default: null },
    checks: { type: Schema.Types.Mixed, default: null },
    starter: { type: String, default: null },
    min_words: { type: Number, default: null },
    time_mins: { type: Number, required: true },
    tags: { type: [String], default: [] },
    source: { type: String, enum: ["ai", "manual"], default: "ai", required: true },
    content_hash: { type: String, required: true, unique: true },
    times_served: { type: Number, default: 0 },
  },
  { collection: "assessment_questions", timestamps: { createdAt: "created_at", updatedAt: false } },
);

const QuestionModel = model<QuestionDocument>("AssessmentQuestion", questionSchema);

const toQuestion = (row: QuestionDocument): Question => ({
  id: row.id,
  roleId: row.role_id,
  competencyId: row.competency_id,
  levels: row.levels,
  kind: row.kind,
  title: row.title,
  prompt: row.prompt,
  context: row.context,
  code: row.code,
  material: row.material,
  options: row.options,
  answer: row.answer,
  rubric: row.rubric,
  checks: row.checks,
  starter: row.starter,
  minWords: row.min_words,
  timeMins: row.time_mins,
  tags: row.tags,
  source: row.source,
});

// Strip the answer key before a question leaves the service.
export const toPublicQuestion = (question: Question): PublicQuestion => {
  const { answer: _answer, rubric: _rubric, checks: _checks, source: _source, ...visible } =
    question;
  return visible;
};

// Stable fingerprint prevents duplicate question content in the bank.
export const contentHash = (
  roleId: string,
  competencyId: string,
  title: string,
  prompt: string,
): string =>
  createHash("sha256")
    .update([roleId, competencyId, title.trim().toLowerCase(), prompt.trim().toLowerCase()].join("|"))
    .digest("hex");

export type NewQuestion = Omit<Question, "id">;

// Insert a question; return null when a duplicate fingerprint already exists.
export async function saveQuestion(question: NewQuestion): Promise<Question | null> {
  const row: QuestionDocument = {
    id: randomUUID(),
    role_id: question.roleId,
    competency_id: question.competencyId,
    levels: question.levels,
    kind: question.kind,
    title: question.title,
    prompt: question.prompt,
    context: question.context ?? null,
    code: question.code ?? null,
    material: question.material ?? null,
    options: question.options ?? null,
    answer: question.answer ?? null,
    rubric: question.rubric ?? null,
    checks: question.checks ?? null,
    starter: question.starter ?? null,
    min_words: question.minWords ?? null,
    time_mins: question.timeMins,
    tags: question.tags,
    source: question.source,
    content_hash: contentHash(question.roleId, question.competencyId, question.title, question.prompt),
    times_served: 0,
  };
  try {
    return toQuestion(await QuestionModel.create(row));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return null;
    }
    throw error;
  }
}

// Randomly sample matching questions, preferring skill overlap and lower exposure.
export async function findCandidates(
  roleId: string,
  competencyId: string,
  level: ExpertiseLevel,
  excludeIds: string[],
  skills: string[],
): Promise<Question[]> {
  const skillSet = skills.map((skill) => skill.toLowerCase());
  const rows = await QuestionModel.aggregate<QuestionDocument>([
    {
      $match: {
        role_id: roleId,
        competency_id: competencyId,
        levels: level,
        id: { $nin: excludeIds },
      },
    },
    { $sample: { size: 50 } },
    {
      $addFields: {
        skill_overlap: {
          $size: {
            $setIntersection: [
              { $map: { input: "$tags", as: "tag", in: { $toLower: "$$tag" } } },
              skillSet,
            ],
          },
        },
      },
    },
    { $sort: { skill_overlap: -1, times_served: 1 } },
    { $limit: 5 },
  ]).exec();
  return rows.map(toQuestion);
}

// Number of stored questions for a competency at a level.
export async function countPool(
  roleId: string,
  competencyId: string,
  level: ExpertiseLevel,
): Promise<number> {
  return QuestionModel.countDocuments({ role_id: roleId, competency_id: competencyId, levels: level });
}

// Load questions by id, preserving the requested order.
export async function getQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (ids.length === 0) return [];
  const rows = await QuestionModel.find({ id: { $in: ids } }).lean<QuestionDocument[]>().exec();
  const byId = new Map(rows.map((row) => [row.id, toQuestion(row)]));
  return ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

// Track exposure so future samples can prefer less-served questions.
export async function markServed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await QuestionModel.updateMany({ id: { $in: ids } }, { $inc: { times_served: 1 } });
}

