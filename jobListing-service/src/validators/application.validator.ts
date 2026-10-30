import { z } from "zod";
import { APPLICATION_STAGES } from "../models/application.model.js";
import type { ApplicationStage } from "../models/application.model.js";
import { objectIdSchema } from "./opportunity.validator.js";

const stageSchema = z.enum(APPLICATION_STAGES);

// Talent submits an optional cover letter; identity and CV come from the session and profile.
const submitApplicationSchema = z
  .object({
    cover_letter: z.string().trim().max(3000).nullable().optional(),
  })
  .strict();

// Talent edits only the cover letter; the CV is re-read from their profile.
const editApplicationSchema = z
  .object({
    cover_letter: z.string().trim().max(3000).nullable(),
  })
  .strict();

const companyApplicationsQuerySchema = z.object({
  company_id: objectIdSchema,
  opportunity_id: objectIdSchema.optional(),
  stage: stageSchema.optional(),
});

// Employers may move stages and write notes; "Withdrawn" is reserved for the applicant.
const updateApplicationSchema = z
  .object({
    current_stage: stageSchema.exclude(["Withdrawn"]).optional(),
    employer_notes: z.string().trim().max(5000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide current_stage or employer_notes",
  });

// Allowed employer-driven stage transitions.
const STAGE_TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  New: ["Reviewed", "Shortlisted", "Rejected"],
  Reviewed: ["Shortlisted", "Interview", "Rejected"],
  Shortlisted: ["Interview", "Test Task", "Offer", "Rejected"],
  Interview: ["Test Task", "Offer", "Rejected"],
  "Test Task": ["Interview", "Offer", "Rejected"],
  Offer: ["Hired", "Rejected"],
  Hired: [],
  Rejected: ["Reviewed"],
  Withdrawn: [],
};

const CLOSED_STAGES: ApplicationStage[] = ["Hired", "Rejected", "Withdrawn"];

export {
  CLOSED_STAGES,
  STAGE_TRANSITIONS,
  companyApplicationsQuerySchema,
  editApplicationSchema,
  submitApplicationSchema,
  updateApplicationSchema,
};
