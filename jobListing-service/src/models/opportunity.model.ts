import { Schema, Types, model } from "mongoose";
import {
  type OpportunityQueryFilters,
  type OpportunitySortColumn,
  OpportunityQuery,
} from "./opportunity-query.js";

// Aggregation pipelines do not auto-cast, so ids used in $match must be real ObjectIds.
const toObjectId = (value: string): Types.ObjectId => new Types.ObjectId(value);

export interface OpportunityRecord {
  id: string;
  company_id: string | null;
  external_company_name: string | null;
  source_type: string;
  external_id: string | null;
  source_url: string | null;
  external_apply_url: string | null;
  title: string;
  description: string;
  responsibilities: string | null;
  // Career role whose assessment a talent must pass to apply; null = not configured.
  role_id: string | null;
  opportunity_type: string;
  employment_type: string | null;
  experience_level: string | null;
  is_paid: boolean;
  compensation_min: string | null;
  compensation_max: string | null;
  currency: string | null;
  payment_frequency: string | null;
  country: string | null;
  location: string | null;
  work_arrangement: string;
  skills_required: string[];
  duration_weeks: number | null;
  start_date: string | null;
  application_deadline: Date | null;
  openings: number | null;
  status: string;
  views_count: number;
  last_synced_at: Date | null;
  expires_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date | null;
}

export type OpportunityInput = Pick<
  OpportunityRecord,
  | "source_type"
  | "title"
  | "description"
  | "opportunity_type"
  | "is_paid"
  | "work_arrangement"
> &
  Partial<
    Omit<
      OpportunityRecord,
      | "id"
      | "source_type"
      | "title"
      | "description"
      | "opportunity_type"
      | "is_paid"
      | "work_arrangement"
      | "views_count"
      | "created_at"
      | "updated_at"
    >
  >;

export type OpportunityUpdate = Partial<
  Pick<
    OpportunityRecord,
    | "title"
    | "description"
    | "responsibilities"
    | "role_id"
    | "opportunity_type"
    | "employment_type"
    | "experience_level"
    | "is_paid"
    | "compensation_min"
    | "compensation_max"
    | "currency"
    | "payment_frequency"
    | "country"
    | "location"
    | "work_arrangement"
    | "skills_required"
    | "duration_weeks"
    | "start_date"
    | "application_deadline"
    | "openings"
    | "status"
    | "external_apply_url"
  >
>;

// Mongoose schema for the Opportunity model
const opportunitySchema = new Schema(
  {
    company_id: { type: Schema.Types.ObjectId, ref: "Company", default: null },
    external_company_name: { type: String, default: null },
    source_type: { type: String, required: true },
    external_id: { type: String, default: null },
    source_url: { type: String, default: null },
    external_apply_url: { type: String, default: null },
    title: { type: String, required: true },
    description: { type: String, required: true },
    responsibilities: { type: String, default: null },
    role_id: { type: String, default: null },
    opportunity_type: { type: String, required: true },
    employment_type: { type: String, default: null },
    experience_level: { type: String, default: null },
    is_paid: { type: Boolean, required: true },
    compensation_min: { type: String, default: null },
    compensation_max: { type: String, default: null },
    currency: { type: String, default: null },
    payment_frequency: { type: String, default: null },
    country: { type: String, default: null },
    location: { type: String, default: null },
    work_arrangement: { type: String, required: true },
    skills_required: { type: [String], default: [] },
    duration_weeks: { type: Number, default: null },
    start_date: { type: String, default: null },
    application_deadline: { type: Date, default: null },
    openings: { type: Number, default: null },
    status: { type: String, default: "published" },
    views_count: { type: Number, default: 0 },
    last_synced_at: { type: Date, default: null },
    expires_at: { type: Date, default: null },
    created_by: { type: String, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: null },
  },
  { collection: "opportunities", versionKey: false },
);

const OpportunityModel = model("Opportunity", opportunitySchema);

// FUNCTIONS FOR OPPORTUNITY MODEL

// Converts a raw MongoDB document to an OpportunityRecord: `_id` becomes a string `id`
// and the ObjectId company reference is serialised to a string.
function toOpportunityRecord(
  value: Record<string, unknown>,
): OpportunityRecord {
  const { _id, company_id, ...record } = value;
  return {
    ...record,
    id: String(_id),
    company_id: company_id == null ? null : String(company_id),
  } as unknown as OpportunityRecord;
}

// Creates a new opportunity record in the database
async function createOpportunity(
  input: OpportunityInput,
): Promise<OpportunityRecord> {
  const opportunity = new OpportunityModel({
    ...input,
    skills_required: input.skills_required ?? [],
    status: input.status ?? "published",
    views_count: 0,
    created_at: new Date(),
    updated_at: null,
  });
  const saved = await opportunity.save();
  return toOpportunityRecord(saved.toObject() as Record<string, unknown>);
}

function buildOpportunityFilter(
  filters: OpportunityQueryFilters,
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    status: filters.status ?? "published",
  };
  if (filters.opportunityType) where.opportunity_type = filters.opportunityType;
  if (filters.employmentType) where.employment_type = filters.employmentType;
  if (filters.experienceLevel) where.experience_level = filters.experienceLevel;
  if (filters.workArrangement) where.work_arrangement = filters.workArrangement;
  if (filters.country) where.country = filters.country.toUpperCase();
  if (filters.isPaid !== undefined) where.is_paid = filters.isPaid;
  if (filters.companyId) where.company_id = toObjectId(filters.companyId);
  if (filters.skills?.length) where.skills_required = { $all: filters.skills };
  if (filters.search) {
    const escapedSearch = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const search = { $regex: escapedSearch, $options: "i" };
    where.$or = [
      { title: search },
      { description: search },
      { location: search },
    ];
  }
  return where;
}

async function queryOpportunities(
  where: Record<string, unknown>,
  sortBy: OpportunitySortColumn,
  sortOrder: "asc" | "desc",
  pageSize: number,
  offset: number,
): Promise<{ items: OpportunityRecord[]; total: number }> {
  const [total, documents] = await Promise.all([
    OpportunityModel.countDocuments(where).exec(),
    OpportunityModel.aggregate<Record<string, unknown>>([
      { $match: where },
      {
        $addFields: {
          __sortNull: { $cond: [{ $eq: [`$${sortBy}`, null] }, 1, 0] },
        },
      },
      {
        $sort: {
          __sortNull: 1,
          [sortBy]: sortOrder === "asc" ? 1 : -1,
          _id: 1,
        },
      },
      { $skip: offset },
      { $limit: pageSize },
      { $project: { __sortNull: 0 } },
    ]).exec(),
  ]);
  return { items: documents.map(toOpportunityRecord), total };
}

async function listOpportunities(query: OpportunityQuery): Promise<{
  items: OpportunityRecord[];
  total: number;
}> {
  return queryOpportunities(
    buildOpportunityFilter(query.filters),
    query.sortBy,
    query.sortOrder,
    query.pageSize,
    query.offset,
  );
}

async function listCompanyOpportunities(
  companyId: string,
  page: number,
  pageSize: number,
): Promise<{ items: OpportunityRecord[]; total: number }> {
  return queryOpportunities(
    { company_id: toObjectId(companyId) },
    "created_at",
    "desc",
    pageSize,
    (page - 1) * pageSize,
  );
}

async function getOpportunityById(
  id: string,
): Promise<OpportunityRecord | undefined> {
  const opportunity = await OpportunityModel.findOne({ _id: id }).lean().exec();
  return opportunity
    ? toOpportunityRecord(opportunity as Record<string, unknown>)
    : undefined;
}

async function updateOpportunity(
  id: string,
  companyId: string,
  input: OpportunityUpdate,
): Promise<OpportunityRecord | undefined> {
  const updates = Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value ?? null]),
  );
  if (Object.keys(updates).length === 0) return getOpportunityById(id);

  const opportunity = await OpportunityModel.findOneAndUpdate(
    { _id: id, company_id: companyId },
    { $set: { ...updates, updated_at: new Date() } },
    { new: true, runValidators: true },
  )
    .lean()
    .exec();
  return opportunity
    ? toOpportunityRecord(opportunity as Record<string, unknown>)
    : undefined;
}

async function deleteOpportunity(
  id: string,
  companyId: string,
): Promise<boolean> {
  const result = await OpportunityModel.deleteOne({
    _id: id,
    company_id: companyId,
  }).exec();
  return result.deletedCount === 1;
}

export {
  createOpportunity,
  getOpportunityById,
  updateOpportunity,
  deleteOpportunity,
  listOpportunities,
  listCompanyOpportunities,
};
