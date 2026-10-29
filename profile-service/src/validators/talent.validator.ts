import { z } from "zod";
import { config } from "../config.js";

// A stored file link must point at our own R2 bucket, so clients can't save arbitrary URLs.
const storedFileUrl = z
  .string()
  .trim()
  .max(1024)
  .refine(
    (url) => !config.r2.publicUrl || url.startsWith(`${config.r2.publicUrl}/`),
    "Must be a file uploaded through Internflare",
  )
  .optional()
  .nullable();

export const EducationItemSchema = z.object({
  institution: z.string().trim().min(1, "Institution is required"),
  degree: z.string().trim().min(1, "Degree is required"),
  field_of_study: z.string().trim().optional(),
  start_year: z.number().int().min(1950).max(2100).optional(),
  end_year: z.number().int().min(1950).max(2100).nullable().optional(),
});

export const ExperienceItemSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  title: z.string().trim().min(1, "Title is required"),
  location: z.string().trim().optional(),
  start_date: z.string().trim().optional(),
  end_date: z.string().trim().nullable().optional(),
  current: z.boolean().optional(),
  description: z.string().trim().optional(),
});

export const AvailabilityEnum = z.enum([
  "immediate",
  "2_weeks",
  "1_month",
  "date",
]);
export const WorkArrangementEnum = z.enum([
  "remote",
  "hybrid",
  "onsite",
  "any",
]);

export const CreateTalentProfileSchema = z.object({
  full_name: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  country: z.string().trim().max(100).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  headline: z.string().trim().max(255).optional().nullable(),
  education: z.array(EducationItemSchema).optional().default([]),
  experience: z.array(ExperienceItemSchema).optional().default([]),
  skills: z.array(z.string().trim().min(1)).optional().default([]),
  preferred_roles: z.array(z.string().trim().min(1)).optional().default([]),
  availability: z.string().trim().max(50).optional().nullable(),
  work_arrangement_pref: z.string().trim().max(50).optional().nullable(),
  career_goals: z.string().trim().max(5000).optional().nullable(),
  cv_url: storedFileUrl,
  avatar_url: storedFileUrl,
});

export const UpdateTalentProfileSchema = CreateTalentProfileSchema.partial();

export const TalentSearchQuerySchema = z.object({
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  country: z.string().trim().optional(),
  availability: z.string().trim().optional(),
  work_arrangement_pref: z.string().trim().optional(),
  min_completeness: z.coerce.number().int().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
