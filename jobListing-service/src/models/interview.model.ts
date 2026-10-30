import { Schema, Types, model } from "mongoose";

export const INTERVIEW_FORMATS = ["video", "phone", "onsite"] as const;
export const INTERVIEW_STATUSES = [
  "pending",
  "confirmed",
  "reschedule_requested",
  "declined",
  "completed",
  "cancelled",
] as const;
export const INTERVIEW_OUTCOMES = ["passed", "failed", "no_show"] as const;

export type InterviewFormat = (typeof INTERVIEW_FORMATS)[number];
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number];

export interface InterviewRecord {
  id: string;
  application_id: string;
  requested_by: string;
  scheduled_at: Date;
  format: InterviewFormat;
  meeting_url: string | null;
  message: string | null;
  status: InterviewStatus;
  reschedule_reason: string | null;
  outcome: InterviewOutcome | null;
  feedback: string | null;
  created_at: Date;
  updated_at: Date | null;
}

interface InterviewDocument {
  application_id: Types.ObjectId;
  requested_by: Types.ObjectId;
  scheduled_at: Date;
  format: InterviewFormat;
  meeting_url: string | null;
  message: string | null;
  status: InterviewStatus;
  reschedule_reason: string | null;
  outcome: InterviewOutcome | null;
  feedback: string | null;
  created_at: Date;
  updated_at: Date | null;
}

const interviewSchema = new Schema<InterviewDocument>(
  {
    application_id: { type: Schema.Types.ObjectId, ref: "Application", required: true },
    requested_by: { type: Schema.Types.ObjectId, ref: "user", required: true },
    scheduled_at: { type: Date, required: true },
    format: { type: String, enum: INTERVIEW_FORMATS, required: true, default: "video" },
    meeting_url: { type: String, default: null },
    message: { type: String, default: null },
    status: { type: String, enum: INTERVIEW_STATUSES, required: true, default: "pending" },
    reschedule_reason: { type: String, default: null },
    outcome: { type: String, enum: INTERVIEW_OUTCOMES, default: null },
    feedback: { type: String, default: null },
    created_at: { type: Date, required: true, default: Date.now },
    updated_at: { type: Date, default: null },
  },
  { collection: "interviews", versionKey: false },
);

interviewSchema.index({ application_id: 1, scheduled_at: -1 });
interviewSchema.index({ scheduled_at: 1 });

const InterviewModel = model("Interview", interviewSchema);

const toInterviewRecord = (doc: Record<string, any>): InterviewRecord => ({
  id: String(doc._id),
  application_id: String(doc.application_id),
  requested_by: String(doc.requested_by),
  scheduled_at: doc.scheduled_at,
  format: doc.format,
  meeting_url: doc.meeting_url ?? null,
  message: doc.message ?? null,
  status: doc.status,
  reschedule_reason: doc.reschedule_reason ?? null,
  outcome: doc.outcome ?? null,
  feedback: doc.feedback ?? null,
  created_at: doc.created_at,
  updated_at: doc.updated_at ?? null,
});

async function createInterview(input: {
  applicationId: string;
  requestedBy: string;
  scheduledAt: Date;
  format: InterviewFormat;
  meetingUrl: string | null;
  message: string | null;
}): Promise<InterviewRecord> {
  const created = await InterviewModel.create({
    application_id: new Types.ObjectId(input.applicationId),
    requested_by: new Types.ObjectId(input.requestedBy),
    scheduled_at: input.scheduledAt,
    format: input.format,
    meeting_url: input.meetingUrl,
    message: input.message,
  });
  return toInterviewRecord(created.toObject());
}

async function findInterviewById(id: string): Promise<InterviewRecord | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await InterviewModel.findById(id).lean().exec();
  return doc ? toInterviewRecord(doc) : null;
}

async function listInterviewsForApplication(applicationId: string): Promise<InterviewRecord[]> {
  const docs = await InterviewModel.find({
    application_id: new Types.ObjectId(applicationId),
  })
    .sort({ scheduled_at: -1 })
    .lean()
    .exec();
  return docs.map(toInterviewRecord);
}

// Interviews for any of the given applications, soonest first.
async function listInterviewsForApplications(applicationIds: string[]): Promise<InterviewRecord[]> {
  if (applicationIds.length === 0) return [];
  const docs = await InterviewModel.find({
    application_id: { $in: applicationIds.map((id) => new Types.ObjectId(id)) },
  })
    .sort({ scheduled_at: 1 })
    .limit(500)
    .lean()
    .exec();
  return docs.map(toInterviewRecord);
}

type InterviewPatch = Partial<
  Pick<
    InterviewRecord,
    | "scheduled_at"
    | "format"
    | "meeting_url"
    | "message"
    | "status"
    | "reschedule_reason"
    | "outcome"
    | "feedback"
  >
>;

async function updateInterview(id: string, patch: InterviewPatch): Promise<InterviewRecord | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const doc = await InterviewModel.findByIdAndUpdate(
    id,
    { $set: { ...patch, updated_at: new Date() } },
    { new: true, runValidators: true },
  )
    .lean()
    .exec();
  return doc ? toInterviewRecord(doc) : null;
}

export {
  createInterview,
  findInterviewById,
  listInterviewsForApplication,
  listInterviewsForApplications,
  updateInterview,
};
export type { InterviewPatch };
