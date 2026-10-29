import { z } from "zod";
import type { CareerRole, Competency, ExpertiseLevel } from "../data/roles.js";
import { saveQuestion, type NewQuestion } from "../models/question.model.js";
import type { Question } from "../types/assessment.js";
import { logger } from "../utils/logger.js";
import { completeJson } from "./openai.service.js";

const kinds = ["mcq", "scenario", "code-review", "code-write", "practical"] as const;

const rubricSchema = z.array(
  z.object({ point: z.string().min(3), keywords: z.array(z.string().min(1)).min(1) }),
);

const generatedQuestionSchema = z.object({
  kind: z.enum(kinds),
  title: z.string().min(3).max(200),
  prompt: z.string().min(10),
  context: z.string().optional(),
  code: z.object({ lang: z.string(), snippet: z.string() }).optional(),
  options: z.array(z.string().min(1)).min(3).max(6).optional(),
  answer: z.number().int().min(0).optional(),
  rubric: rubricSchema.optional(),
  checks: z.array(z.object({ label: z.string(), pattern: z.string() })).optional(),
  starter: z.string().optional(),
  minWords: z.number().int().min(10).max(400).optional(),
  timeMins: z.number().int().min(2).max(25).default(6),
  tags: z.array(z.string()).max(8).default([]),
});

const responseSchema = z.object({ questions: z.array(z.unknown()) });

// Question kinds the model should produce, depending on the role family.
const developerKinds = ["code-review", "code-write", "mcq"];
const generalKinds = ["mcq", "scenario", "practical"];

// A generated question is only kept when it carries what grading needs for its kind.
function isGradable(question: z.infer<typeof generatedQuestionSchema>): boolean {
  switch (question.kind) {
    case "mcq":
      return Boolean(question.options && question.answer !== undefined && question.answer < question.options.length);
    case "code-review":
      return Boolean(
        question.code && question.options && question.answer !== undefined &&
          question.answer < question.options.length && question.rubric?.length,
      );
    case "code-write":
      return Boolean(
        question.starter !== undefined && question.checks?.length &&
          question.checks.every((check) => {
            try {
              new RegExp(check.pattern, "im");
              return true;
            } catch {
              return false;
            }
          }),
      );
    default:
      return Boolean(question.rubric?.length);
  }
}

// Guards against concurrent generation for the same pool.
const inFlight = new Set<string>();

// Generate and store new questions for one competency; returns the questions that were saved.
export async function generateQuestions(
  role: CareerRole,
  competency: Competency,
  level: ExpertiseLevel,
  skills: string[],
  count = 3,
): Promise<Question[]> {
  const key = `${role.id}:${competency.id}:${level}`;
  if (inFlight.has(key)) return [];
  inFlight.add(key);

  try {
    const kindList = (role.isDeveloper ? developerKinds : generalKinds).join(", ");
    const system =
      "You write production-realistic hiring assessment questions for an early-career talent platform. " +
      'Respond with ONLY a JSON object: {"questions":[...]}. Every question object has: kind, title, prompt, context, timeMins, tags (lowercase skills/technologies). ' +
      "mcq: options (3-5 strings) and answer (0-based index of the single correct option). " +
      "code-review: code {lang, snippet}, options, answer, rubric [{point, keywords}] for the fix explanation. " +
      "code-write: starter code, checks [{label, pattern}] where pattern is a case-insensitive JavaScript regex source that passes for a correct solution. " +
      "scenario and practical: rubric [{point, keywords}] with lowercase keywords, plus minWords. " +
      "Never include solutions in prompt, context or starter.";
    const user =
      `Role: ${role.title}\nCompetency: ${competency.label} - ${competency.description}\n` +
      `Level: ${level}\nTalent skills to favour when relevant (use their languages for code): ${skills.slice(0, 12).join(", ") || "none given"}\n` +
      `Allowed kinds: ${kindList}\nWrite ${count} distinct questions.`;

    const raw = await completeJson(responseSchema, system, user, 0.8);
    const saved: Question[] = [];
    for (const candidate of raw.questions) {
      const parsed = generatedQuestionSchema.safeParse(candidate);
      if (!parsed.success || !isGradable(parsed.data)) continue;
      const question = parsed.data;
      const stored: NewQuestion = {
        roleId: role.id,
        competencyId: competency.id,
        levels: [level],
        kind: question.kind,
        title: question.title,
        prompt: question.prompt,
        context: question.context ?? null,
        code: question.code ?? null,
        options: question.options ?? null,
        answer: question.answer ?? null,
        rubric: question.rubric?.map((r) => ({ ...r, keywords: r.keywords.map((k) => k.toLowerCase()) })) ?? null,
        checks: question.checks ?? null,
        starter: question.starter ?? null,
        minWords: question.minWords ?? null,
        timeMins: question.timeMins,
        tags: question.tags.map((tag) => tag.toLowerCase()),
        source: "ai",
      };
      const created = await saveQuestion(stored);
      if (created) saved.push(created);
    }
    logger("info", `Generated ${saved.length} new ${level} question(s) for ${key}`);
    return saved;
  } finally {
    inFlight.delete(key);
  }
}
