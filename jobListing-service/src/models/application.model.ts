import { Schema, Types, model } from "mongoose";
import { AppError } from "../utils/appError.js";

export const APPLICATION_STAGES = [
  "New",
  "Reviewed",
  "Shortlisted",
  "Interview",
  "Test Task",
  "Offer",
  "Hired",
  "Rejected",
  "Withdrawn",
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export interface MatchFactor {
  label: string;
  score: number;
  note: string;
}

export interface ApplicationRecord {
  id: string;
  opportunity_id: string;
  talent_id: string;
  cover_letter: string | null;
  cv_url: string | null;
  current_stage: ApplicationStage;
  ai_match_score: number | null;
  ai_match_factors: MatchFactor[] | null;
  employer_notes: string | null;
  applied_at: Date;
  updated_at: Date | null;
}

interface ApplicationDocument {
  opportunity_id: Types.ObjectId;
  talent_id: Types.ObjectId;
  cover_letter: string | null;
  cv_url: string | null;
  current_stage: ApplicationStage;
  ai_match_score: number | null;
  ai_match_factors: MatchFactor[] | null;
  employer_notes: string | null;
  applied_at: Date;
  updated_at: Date | null;
}

const applicationSchema = new Schema<ApplicationDocument>(
  {
    opportunity_id: {
      type: Schema.Types.ObjectId,
      ref: "Opportunity",
      required: true,
    },
    talent_id: { type: Schema.Types.ObjectId, ref: "user", required: true },
    cover_letter: { type: String, default: null },
    cv_url: { type: String, default: null },
    current_stage: {
      type: String,
      enum: APPLICATION_STAGES,
      required: true,
      default: "New",
    },
    ai_match_score: { type: Number, min: 0, max: 100, default: null },
    ai_match_factors: { type: Schema.Types.Mixed, default: null },
    employer_notes: { type: String, default: null },
    applied_at: { type: Date, required: true, default: Date.now },
    updated_at: { type: Date, default: null },
  },
  { collection: "applications", versionKey: false },
);

// One application per talent per listing; also the de-duplication point for double submits.
applicationSchema.index({ opportunity_id: 1, talent_id: 1 }, { unique: true });
applicationSchema.index({ talent_id: 1, applied_at: -1 });
applicationSchema.index({ opportunity_id: 1, current_stage: 1 });

const ApplicationModel = model("Application", applicationSchema);

const toApplicationRecord = (doc: Record<string, any>): ApplicationRecord => ({
  id: String(doc._id),
  opportunity_id: String(doc.opportunity_id),
  talent_id: String(doc.talent_id),
  cover_letter: doc.cover_letter ?? null,
  cv_url: doc.cv_url ?? null,
  current_stage: doc.current_stage,
  ai_match_score: doc.ai_match_score ?? null,
  ai_match_factors: doc.ai_match_factors ?? null,
  employer_notes: doc.employer_notes ?? null,
  applied_at: doc.applied_at,
  updated_at: doc.updated_at ?? null,
});

const isValidId = (id: string): boolean => Types.ObjectId.isValid(id);

async function createApplication(input: {
  opportunityId: string;
  talentId: string;
  coverLetter: string | null;
  cvUrl: string | null;
  matchScore: number | null;
  matchFactors: MatchFactor[] | null;
}): Promise<ApplicationRecord> {
  try {
    const created = await ApplicationModel.create({
      opportunity_id: new Types.ObjectId(input.opportunityId),
      talent_id: new Types.ObjectId(input.talentId),
      cover_letter: input.coverLetter,
      cv_url: input.cvUrl,
      ai_match_score: input.matchScore,
      ai_match_factors: input.matchFactors,
    });
    return toApplicationRecord(created.toObject());
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new AppError("You have already applied to this listing", 409);
    }
    throw error;
  }
}

async function findApplicationById(
  id: string,
): Promise<ApplicationRecord | null> {
  if (!isValidId(id)) return null;
  const doc = await ApplicationModel.findById(id).lean().exec();
  return doc ? toApplicationRecord(doc) : null;
}

// Opportunity ids a talent has applied to (used to mark listings as already applied).
async function listAppliedOpportunityIds(talentId: string): Promise<string[]> {
  const docs = await ApplicationModel.find({
    talent_id: new Types.ObjectId(talentId),
  })
    .select("opportunity_id")
    .lean()
    .exec();
  return docs.map((doc) => String(doc.opportunity_id));
}

async function hasApplied(
  talentId: string,
  opportunityId: string,
): Promise<boolean> {
  const found = await ApplicationModel.exists({
    talent_id: new Types.ObjectId(talentId),
    opportunity_id: new Types.ObjectId(opportunityId),
  }).exec();
  return found !== null;
}

export interface TalentApplicationRow extends ApplicationRecord {
  opportunity: {
    id: string;
    title: string;
    opportunity_type: string;
    company_id: string | null;
    company_name: string | null;
    company_logo_url: string | null;
  } | null;
}

// A talent's applications, newest first, each joined with its listing and company name.
async function listApplicationsForTalent(
  talentId: string,
): Promise<TalentApplicationRow[]> {
  const docs = await ApplicationModel.aggregate<Record<string, any>>([
    { $match: { talent_id: new Types.ObjectId(talentId) } },
    { $sort: { applied_at: -1 } },
    { $limit: 200 },
    {
      $lookup: {
        from: "opportunities",
        localField: "opportunity_id",
        foreignField: "_id",
        as: "opportunity",
      },
    },
    { $unwind: { path: "$opportunity", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "companies",
        localField: "opportunity.company_id",
        foreignField: "_id",
        as: "company",
      },
    },
    { $unwind: { path: "$company", preserveNullAndEmptyArrays: true } },
  ]).exec();

  return docs.map((doc) => ({
    ...toApplicationRecord(doc),
    opportunity: doc.opportunity
      ? {
          id: String(doc.opportunity._id),
          title: doc.opportunity.title,
          opportunity_type: doc.opportunity.opportunity_type,
          company_id: doc.opportunity.company_id
            ? String(doc.opportunity.company_id)
            : null,
          company_name:
            doc.company?.name ?? doc.opportunity.external_company_name ?? null,
          company_logo_url: doc.company?.logo_url ?? null,
        }
      : null,
  }));
}

// Applications across all (or one) of a company's listings, newest first.
async function listApplicationsForCompany(
  companyId: string,
  filters: { opportunityId?: string; stage?: ApplicationStage },
): Promise<{ applications: ApplicationRecord[]; titles: Map<string, string> }> {
  const listings = await model("Opportunity")
    .find({ company_id: new Types.ObjectId(companyId) })
    .select("title")
    .lean()
    .exec();
  const titles = new Map<string, string>(
    listings.map((listing: any) => [String(listing._id), listing.title]),
  );

  const opportunityIds = filters.opportunityId
    ? titles.has(filters.opportunityId)
      ? [new Types.ObjectId(filters.opportunityId)]
      : []
    : [...titles.keys()].map((id) => new Types.ObjectId(id));

  const query: Record<string, unknown> = {
    opportunity_id: { $in: opportunityIds },
  };
  if (filters.stage) query.current_stage = filters.stage;

  const docs = await ApplicationModel.find(query)
    .sort({ applied_at: -1 })
    .limit(500)
    .lean()
    .exec();
  return { applications: docs.map(toApplicationRecord), titles };
}

async function updateApplication(
  id: string,
  patch: { current_stage?: ApplicationStage; employer_notes?: string | null },
): Promise<ApplicationRecord | null> {
  if (!isValidId(id)) return null;
  const doc = await ApplicationModel.findByIdAndUpdate(
    id,
    { $set: { ...patch, updated_at: new Date() } },
    { new: true, runValidators: true },
  )
    .lean()
    .exec();
  return doc ? toApplicationRecord(doc) : null;
}

export {
  createApplication,
  findApplicationById,
  hasApplied,
  listAppliedOpportunityIds,
  listApplicationsForCompany,
  listApplicationsForTalent,
  updateApplication,
};
