import type { Request } from "express";
import { z } from "zod";
import { careerToolGrounding, getCareerTool } from "../data/career-tools.js";
import { getRole } from "../data/roles.js";
import { listCompletedAttempts } from "../models/attempt.model.js";
import type { CareerToolInput } from "../validators/career-tool.validator.js";
import { AppError } from "../utils/appError.js";
import { fetchEligibility, fetchListing } from "./listing-client.service.js";
import { completeJson } from "./openai.service.js";
import { fetchTalentProfile } from "./profile-client.service.js";

const resultSchema = z.object({ text: z.string().trim().min(10).max(8_000) });

// The profile-service fields career tools read (the shared type only lists a few).
interface ProfileFacts {
  full_name?: string | null;
  location?: string | null;
  headline?: string | null;
  education?: Array<Record<string, unknown>>;
  experience?: Array<Record<string, unknown>>;
  skills?: string[];
  preferred_roles?: string[];
  availability?: string | null;
  career_goals?: string | null;
  profile_completeness?: number;
  readiness_score?: number;
}

const line = (label: string, value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  return text ? `${label}: ${text}` : null;
};

const describe = (item: Record<string, unknown>, keys: string[]): string =>
  keys
    .map((key) => item[key])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" · ");

function profileSheet(profile: ProfileFacts, name: string, email: string): string {
  const education = (profile.education ?? []).map((e) =>
    describe(e, ["degree", "field_of_study", "institution", "start_year", "end_year"]),
  );
  const experience = (profile.experience ?? []).map((e) =>
    describe(e, ["title", "company", "location", "start_date", "end_date", "description"]),
  );
  return [
    line("Name", profile.full_name || name),
    line("Email", email),
    line("Location", profile.location),
    line("Headline", profile.headline),
    line("Skills", profile.skills),
    line("Preferred roles", profile.preferred_roles),
    line("Availability", profile.availability),
    line("Career goals", profile.career_goals),
    education.length ? `Education:\n- ${education.join("\n- ")}` : null,
    experience.length ? `Experience:\n- ${experience.join("\n- ")}` : null,
    line("Profile completeness", profile.profile_completeness),
  ]
    .filter(Boolean)
    .join("\n");
}

async function assessmentSheet(userId: string): Promise<string> {
  const attempts = await listCompletedAttempts(userId);
  if (attempts.length === 0) return "Assessments: none completed yet";
  const rows = attempts.slice(0, 8).map((a) => {
    const role = getRole(a.role_id)?.title ?? a.role_id;
    return `${role} (${a.level}): score ${a.overall_score ?? "n/a"}, placement ${a.placement ?? "n/a"}`;
  });
  return `Assessments (newest first):\n- ${rows.join("\n- ")}`;
}

// Runs one career tool: grounds the model in the caller's real profile, assessments and
// (when relevant) the chosen listing, then returns the generated text.
export async function runCareerTool(
  req: Request,
  toolId: string,
  input: CareerToolInput,
): Promise<string> {
  const tool = getCareerTool(toolId);
  const user = req.user;
  if (!tool || !user) throw new AppError("Unknown career tool", 404);
  if (tool.inputRequired && !input.input) {
    throw new AppError("Add some text for this tool to work with", 400);
  }
  if (tool.needsOpportunity && !input.opportunity_id) {
    throw new AppError("Choose a listing for this tool", 400);
  }

  const [profile, assessments] = await Promise.all([
    fetchTalentProfile(req) as Promise<ProfileFacts>,
    assessmentSheet(user.id),
  ]);

  const sections = [
    `TALENT PROFILE\n${profileSheet(profile, user.name ?? "", user.email)}`,
    assessments,
  ];

  if (tool.needsOpportunity && input.opportunity_id) {
    const [listing, eligibility] = await Promise.all([
      fetchListing(req, input.opportunity_id),
      fetchEligibility(req, input.opportunity_id),
    ]);
    sections.push(
      `LISTING\n${[
        line("Title", listing.title),
        line("Company", listing.external_company_name),
        line("Type", listing.opportunity_type),
        line("Level", listing.experience_level),
        line("Arrangement", listing.work_arrangement),
        line("Location", listing.location),
        line("Skills required", listing.skills_required),
        line("Description", listing.description),
        line("Responsibilities", listing.responsibilities),
      ]
        .filter(Boolean)
        .join("\n")}`,
    );
    if (eligibility) {
      sections.push(
        `ELIGIBILITY\n${[
          line("Result", eligibility.state),
          line("Needs placement", eligibility.required_placement),
          line("Talent placement", eligibility.placement),
          line("Assessment score", eligibility.overall_score),
        ]
          .filter(Boolean)
          .join("\n")}`,
      );
    }
  }

  if (input.context) sections.push(`CONTEXT CHOSEN BY THE TALENT\n${input.context}`);
  if (input.input) sections.push(`TALENT'S OWN TEXT\n${input.input}`);

  const system = `${tool.instruction} ${careerToolGrounding} Respond with JSON: {"text": "<the finished output>"}.`;
  const result = await completeJson(resultSchema, system, sections.join("\n\n"), 0.5);
  return result.text;
}
