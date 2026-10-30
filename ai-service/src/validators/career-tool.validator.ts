import { z } from "zod";
import { careerToolIds } from "../data/career-tools.js";

const objectIdSchema = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid id");

export const careerToolParamsSchema = z.object({
  toolId: z.enum(careerToolIds),
});

export const careerToolBodySchema = z
  .object({
    context: z.string().trim().max(200).default(""),
    input: z.string().trim().max(8_000).default(""),
    opportunity_id: objectIdSchema.optional(),
  })
  .strict();

export type CareerToolInput = z.infer<typeof careerToolBodySchema>;
