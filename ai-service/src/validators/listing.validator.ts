import { z } from "zod";

const shortText = (max: number) => z.string().trim().max(max);

// Listing details the employer has filled in so far; only the title is mandatory.
export const draftDescriptionSchema = z
  .object({
    title: shortText(150).min(2, "Enter a job title first"),
    company_name: shortText(150).optional(),
    opportunity_type: shortText(40).optional(),
    experience_level: shortText(40).optional(),
    work_arrangement: shortText(40).optional(),
    location: shortText(150).optional(),
    duration: shortText(60).optional(),
    is_paid: z.boolean().optional(),
    skills: z.array(shortText(60)).max(30).default([]),
    responsibilities: z.array(shortText(300)).max(20).default([]),
    requirements: z.array(shortText(300)).max(20).default([]),
  })
  .strict();

export type DraftDescriptionInput = z.infer<typeof draftDescriptionSchema>;
