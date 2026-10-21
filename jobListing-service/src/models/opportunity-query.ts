import { z } from "zod";

const opportunityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1), // Default to page 1 if not provided
  page_size: z.coerce.number().int().min(1).max(100).default(20), // Default to 20 items per page if not provided
  sort_by: z
    .enum([
      "created_at",
      "updated_at",
      "application_deadline",
      "start_date",
      "title",
    ])
    .default("created_at"),
  sort_order: z.enum(["asc", "desc"]).default("desc"), // Default to descending order if not provided
  opportunity_type: z.string().trim().min(1).optional(), // Filter by opportunity type if provided
  employment_type: z.string().trim().min(1).optional(), // Filter by employment type if provided
  experience_level: z.string().trim().min(1).optional(), // Filter by experience level if provided
  work_arrangement: z.string().trim().min(1).optional(), // Filter by work arrangement if provided
  country: z.string().trim().length(2).optional(), // Filter by country code if provided
  status: z.enum(["draft", "published", "paused", "closed"]).optional(),
  is_paid: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(), // Filter by paid status if provided
  search: z.string().trim().min(1).max(200).optional(), // Filter by search term if provided
  skills: z
    .string()
    .transform((value) => value.split(",").map((skill) => skill.trim()))
    .pipe(z.array(z.string().min(1)).max(100))
    .optional(),
  company_id: z.uuid().optional(),
});

export type OpportunitySortColumn =
  | "created_at"
  | "updated_at"
  | "application_deadline"
  | "start_date"
  | "title";

export interface OpportunityQueryFilters {
  opportunityType?: string;
  employmentType?: string;
  experienceLevel?: string;
  workArrangement?: string;
  country?: string;
  status?: string;
  isPaid?: boolean;
  search?: string;
  skills?: string[];
  companyId?: string;
}

export interface OpportunityQueryPagination {
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

type ParsedOpportunityQuery = z.output<typeof opportunityQuerySchema>;

/**
 * Validates and carries pagination, sorting, and filters parsed from URL query parameters.
 */
export class OpportunityQuery {
  private constructor(private readonly parameters: ParsedOpportunityQuery) {}

  /**
   * Parse Express query parameters without allowing unchecked values into SQL.
   */
  static fromUrlParameters(parameters: unknown) {
    const parsed = opportunityQuerySchema.safeParse(parameters);
    if (!parsed.success) return parsed;
    return { success: true as const, data: new OpportunityQuery(parsed.data) };
  }

  get page(): number {
    return this.parameters.page;
  }

  get pageSize(): number {
    return this.parameters.page_size;
  }

  get sortBy(): OpportunitySortColumn {
    // The schema whitelist makes this safe to interpolate as a SQL identifier.
    return this.parameters.sort_by;
  }

  get sortOrder(): "asc" | "desc" {
    return this.parameters.sort_order;
  }

  /**
   * Return normalized search filters for the parameterized database query.
   */
  get filters(): OpportunityQueryFilters {
    const {
      opportunity_type: opportunityType,
      employment_type: employmentType,
      experience_level: experienceLevel,
      work_arrangement: workArrangement,
      country,
      status,
      is_paid: isPaid,
      search,
      skills,
      company_id: companyId,
    } = this.parameters;

    return {
      opportunityType,
      employmentType,
      experienceLevel,
      workArrangement,
      country,
      status,
      isPaid,
      search,
      skills,
      companyId,
    };
  }

  /**
   * Calculate the SQL offset and the response metadata from the same validated page values.
   */
  get offset(): number {
    return (this.page - 1) * this.pageSize;
  }

  pagination(totalItems: number): OpportunityQueryPagination {
    return {
      page: this.page,
      page_size: this.pageSize,
      total_items: totalItems,
      total_pages: Math.ceil(totalItems / this.pageSize),
    };
  }

  sorting(): { sort_by: OpportunitySortColumn; sort_order: "asc" | "desc" } {
    return { sort_by: this.sortBy, sort_order: this.sortOrder };
  }
}
