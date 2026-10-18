import type { QueryResultRow } from "pg";
import { database } from "../db/pool.js";
import {
  type OpportunityQueryFilters,
  type OpportunitySortColumn,
  OpportunityQuery,
} from "./opportunity-query.js";

export interface OpportunityRecord extends QueryResultRow {
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

const columns = [
  "company_id",
  "external_company_name",
  "source_type",
  "external_id",
  "source_url",
  "external_apply_url",
  "title",
  "description",
  "responsibilities",
  "opportunity_type",
  "employment_type",
  "experience_level",
  "is_paid",
  "compensation_min",
  "compensation_max",
  "currency",
  "payment_frequency",
  "country",
  "location",
  "work_arrangement",
  "skills_required",
  "duration_weeks",
  "start_date",
  "application_deadline",
  "openings",
  "status",
  "last_synced_at",
  "expires_at",
  "created_by",
] as const;

// This function creates a new opportunity in the database and returns the created record.
async function createOpportunity(
  input: OpportunityInput,
): Promise<OpportunityRecord> {
  const values = columns.map((column) => input[column] ?? null);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const result = await database.query<OpportunityRecord>(
    `INSERT INTO opportunities (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values,
  );

  const opportunity = result.rows[0];
  if (!opportunity) {
    throw new Error("PostgreSQL did not return the created opportunity");
  }
  return opportunity;
}

async function listOpportunities(query: OpportunityQuery): Promise<{
  items: OpportunityRecord[];
  total: number;
}> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const filters: OpportunityQueryFilters = query.filters;
  const addCondition = (sql: string, value: unknown): void => {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  };

  // Keep filter values parameterized; only schema-validated column names are interpolated below.
  if (filters.opportunityType)
    addCondition("opportunity_type = ?", filters.opportunityType);
  if (filters.employmentType)
    addCondition("employment_type = ?", filters.employmentType);
  if (filters.experienceLevel)
    addCondition("experience_level = ?", filters.experienceLevel);
  if (filters.workArrangement)
    addCondition("work_arrangement = ?", filters.workArrangement);
  if (filters.country)
    addCondition("country = ?", filters.country.toUpperCase());
  if (filters.status) addCondition("status = ?", filters.status);
  if (filters.isPaid !== undefined) addCondition("is_paid = ?", filters.isPaid);
  if (filters.companyId) addCondition("company_id = ?", filters.companyId);
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(
      `(title ILIKE $${values.length} OR description ILIKE $${values.length} OR location ILIKE $${values.length})`,
    );
  }
  if (filters.skills?.length) {
    values.push(filters.skills);
    conditions.push(`skills_required @> $${values.length}::text[]`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";
  const countResult = await database.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM opportunities ${whereClause}`,
    values,
  );

  const listValues = [...values, query.pageSize, query.offset];
  const sortColumn: OpportunitySortColumn = query.sortBy;
  const sortDirection = query.sortOrder === "asc" ? "ASC" : "DESC";
  const result = await database.query<OpportunityRecord>(
    `SELECT * FROM opportunities ${whereClause}
     ORDER BY ${sortColumn} ${sortDirection} NULLS LAST, id ASC
     LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );

  return {
    items: result.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}

async function getOpportunityById(
  id: string,
): Promise<OpportunityRecord | undefined> {
  const result = await database.query<OpportunityRecord>(
    "SELECT * FROM opportunities WHERE id = $1",
    [id],
  );
  return result.rows[0];
}

async function checkDatabaseConnection(): Promise<void> {
  await database.query("SELECT 1");
}

export {
  createOpportunity,
  getOpportunityById,
  listOpportunities,
  checkDatabaseConnection,
};
