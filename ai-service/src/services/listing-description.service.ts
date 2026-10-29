import { z } from "zod";
import type { DraftDescriptionInput } from "../validators/listing.validator.js";
import { completeJson } from "./openai.service.js";

const descriptionResultSchema = z.object({
  description: z.string().trim().min(40).max(4_000),
});

const SYSTEM_PROMPT = [
  "You write job and internship descriptions for an African early-career talent platform.",
  "Write 2 short paragraphs of plain text (no markdown, no bullet lists, no headings):",
  "1) what the role is and the team's mission, 2) what the person will do day to day and the growth they get.",
  "Use only the facts provided. Never invent salaries, benefits, company claims or tools that were not given.",
  'If the company name is missing, write "our team". Keep a warm, clear, inclusive tone.',
  'Respond with JSON: {"description": "<text>"}.',
].join(" ");

// Turns the form fields into a compact fact sheet for the model, skipping blanks.
function buildFactSheet(input: DraftDescriptionInput): string {
  const lines: Array<[string, string | undefined]> = [
    ["Title", input.title],
    ["Company", input.company_name],
    ["Type", input.opportunity_type],
    ["Experience level", input.experience_level],
    ["Work arrangement", input.work_arrangement],
    ["Location", input.location],
    ["Duration", input.duration],
    ["Paid", input.is_paid === undefined ? undefined : input.is_paid ? "yes" : "no"],
    ["Skills", input.skills.join(", ") || undefined],
    ["Responsibilities", input.responsibilities.filter(Boolean).join("; ") || undefined],
    ["Requirements", input.requirements.filter(Boolean).join("; ") || undefined],
  ];
  return lines
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

// Generates a listing description tailored to the given listing details (502 on provider failure).
export async function draftListingDescription(
  input: DraftDescriptionInput,
): Promise<string> {
  const result = await completeJson(
    descriptionResultSchema,
    SYSTEM_PROMPT,
    buildFactSheet(input),
    0.6,
  );
  return result.description;
}
