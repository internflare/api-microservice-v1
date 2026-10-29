import type { CareerRole, Competency, ExpertiseLevel } from "../data/roles.js";
import { findCandidates, markServed } from "../models/question.model.js";
import type { ProfileSnapshot, Question, QuestionKind } from "../types/assessment.js";
import { logger } from "../utils/logger.js";
import { generateQuestions } from "./question-generator.service.js";

// How many questions of every assessment are written by the AI in real time; the rest come from the bank.
const LIVE_QUESTION_COUNT = 2;
// Questions requested per live call; the extras are saved so the bank keeps growing.
const GENERATED_PER_CALL = 2;

// Warm-up first, written communication last (same ordering as the product design).
const kindOrder: QuestionKind[] = ["mcq", "code-review", "code-write", "scenario", "practical"];

type Slot = { competency: Competency; candidates: Question[] };

// Fisher-Yates shuffle on a copy.
function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

// Write a fresh question with OpenAI for one competency (saved to the bank by the generator).
// Falls back to a stored question when generation fails, so one bad AI call never blocks the test.
async function generateForSlot(
  role: CareerRole,
  level: ExpertiseLevel,
  slot: Slot,
  profile: ProfileSnapshot,
): Promise<Question | undefined> {
  try {
    const created = await generateQuestions(role, slot.competency, level, profile.skills, GENERATED_PER_CALL);
    if (created[0]) return created[0];
  } catch (error) {
    logger("warn", `Question generation failed for ${role.id}/${slot.competency.id}:`, error);
  }
  if (slot.candidates[0]) return slot.candidates[0];
  // Last resort: repeat the least-served stored question rather than leave a competency untested.
  return (await findCandidates(role.id, slot.competency.id, level, [], profile.skills))[0];
}

// Build one assessment: most questions are random fits from the bank, a few are generated live.
// When the bank has nothing unseen for a competency, that competency is generated instead.
export async function selectQuestions(
  role: CareerRole,
  level: ExpertiseLevel,
  userId: string,
  seenIds: string[],
  profile: ProfileSnapshot,
): Promise<Question[]> {
  const slots: Slot[] = await Promise.all(
    role.competencies.map(async (competency) => ({
      competency,
      candidates: await findCandidates(role.id, competency.id, level, seenIds, profile.skills),
    })),
  );

  const storedCount = Math.max(0, slots.length - LIVE_QUESTION_COUNT);
  const fromBank = shuffle(slots.filter((slot) => slot.candidates.length > 0)).slice(0, storedCount);
  const liveSlots = slots.filter((slot) => !fromBank.includes(slot));

  const generated = await Promise.all(liveSlots.map((slot) => generateForSlot(role, level, slot, profile)));
  const picked: Question[] = [
    ...fromBank.flatMap((slot) => slot.candidates[0] ?? []),
    ...generated.flatMap((question) => question ?? []),
  ];

  picked.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
  await markServed(picked.map((question) => question.id));
  logger(
    "info",
    `Selected ${picked.length} question(s) for user ${userId} (${role.id}, ${level}): ` +
      `${fromBank.length} from bank, ${liveSlots.length} generated`,
  );
  return picked;
}
