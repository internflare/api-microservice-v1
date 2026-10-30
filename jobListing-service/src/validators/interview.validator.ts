import { z } from "zod";
import {
  INTERVIEW_FORMATS,
  INTERVIEW_OUTCOMES,
  type InterviewStatus,
} from "../models/interview.model.js";
import { objectIdSchema } from "./opportunity.validator.js";

const futureDate = z.coerce.date().refine((date) => date.getTime() > Date.now(), {
  message: "Interview time must be in the future",
});

const meetingUrl = z.string().trim().url().max(500).nullable().optional();

const createInterviewSchema = z
  .object({
    scheduled_at: futureDate,
    format: z.enum(INTERVIEW_FORMATS),
    meeting_url: meetingUrl,
    message: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const respondInterviewSchema = z
  .object({
    response: z.enum(["confirm", "decline", "reschedule"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((value) => value.response === "confirm" || !!value.reason, {
    message: "Please give a short reason",
    path: ["reason"],
  });

// Employers reschedule (time/format/link), cancel, or record the result after it happened.
const updateInterviewSchema = z
  .object({
    scheduled_at: futureDate.optional(),
    format: z.enum(INTERVIEW_FORMATS).optional(),
    meeting_url: meetingUrl,
    message: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(["cancelled", "completed"]).optional(),
    outcome: z.enum(INTERVIEW_OUTCOMES).optional(),
    feedback: z.string().trim().max(5000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update" })
  .refine((value) => value.status !== "completed" || !!value.outcome, {
    message: "Choose an outcome to complete the interview",
    path: ["outcome"],
  });

const companyInterviewsQuerySchema = z.object({ company_id: objectIdSchema });

// Interviews in these states can still be changed by either side.
const OPEN_INTERVIEW_STATUSES: InterviewStatus[] = ["pending", "confirmed", "reschedule_requested"];

export {
  OPEN_INTERVIEW_STATUSES,
  companyInterviewsQuerySchema,
  createInterviewSchema,
  respondInterviewSchema,
  updateInterviewSchema,
};
