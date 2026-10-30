// Companies, opportunities and saved items are all keyed by MongoDB ObjectIds.
const objectIdSchema = {
  type: "string",
  pattern: "^[a-fA-F0-9]{24}$",
  example: "665f1c2e8a1b2c3d4e5f6a7b",
} as const;

const opportunityProperties = {
  id: { ...objectIdSchema, readOnly: true },
  company_id: { ...objectIdSchema, type: ["string", "null"] },
  external_company_name: { type: ["string", "null"] },
  source_type: { type: "string" },
  external_id: { type: ["string", "null"] },
  source_url: { type: ["string", "null"], format: "uri" },
  external_apply_url: { type: ["string", "null"], format: "uri" },
  title: { type: "string" },
  description: { type: "string" },
  responsibilities: { type: ["string", "null"] },
  role_id: {
    type: ["string", "null"],
    enum: ["frontend-developer", "data-analyst", "backend-engineer", "product-designer", "growth-marketer", "support-engineer", "virtual-assistant", "programme-assistant", null],
    description: "Career role whose assessment a talent must pass to apply. Null means applications are disabled.",
  },
  opportunity_type: { type: "string" },
  employment_type: { type: ["string", "null"] },
  experience_level: { type: ["string", "null"] },
  is_paid: { type: "boolean" },
  compensation_min: { type: ["number", "null"] },
  compensation_max: { type: ["number", "null"] },
  currency: { type: ["string", "null"], minLength: 3, maxLength: 3 },
  payment_frequency: { type: ["string", "null"] },
  country: { type: ["string", "null"], minLength: 2, maxLength: 2 },
  location: { type: ["string", "null"] },
  work_arrangement: { type: "string" },
  skills_required: { type: "array", items: { type: "string" } },
  duration_weeks: { type: ["integer", "null"] },
  start_date: { type: ["string", "null"], format: "date" },
  application_deadline: { type: ["string", "null"], format: "date-time" },
  openings: { type: ["integer", "null"] },
  status: { type: "string" },
  views_count: { type: "integer", readOnly: true },
  last_synced_at: { type: ["string", "null"], format: "date-time" },
  expires_at: { type: ["string", "null"], format: "date-time" },
  created_by: { type: ["string", "null"] },
  created_at: { type: "string", format: "date-time", readOnly: true },
  updated_at: { type: ["string", "null"], format: "date-time", readOnly: true },
} as const;

const opportunityRequired = [
  "source_type",
  "title",
  "description",
  "opportunity_type",
  "is_paid",
  "work_arrangement",
];

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Internflare Job Listing Service",
    version: "1.0.0",
    description:
      "Create and search job and internship opportunities. Published jobs can enqueue follower notifications through the shared RabbitMQ notification queue.",
  },
  servers: [{ url: "/", description: "Current jobListing-service origin" }],
  tags: [
    { name: "Health", description: "Service and dependency health" },
    { name: "Opportunities", description: "Opportunity listings" },
    { name: "Applications", description: "Application notification handoff" },
    { name: "Interviews", description: "Interview scheduling between employers and applicants" },
    { name: "Saved opportunities", description: "A talent's bookmarked listings" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Check database and RabbitMQ connectivity",
        responses: {
          "200": {
            description: "Service dependencies are healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
          "503": {
            description: "A required dependency is unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/opportunities": {
      get: {
        tags: ["Opportunities"],
        summary: "Search and paginate opportunities",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: 1000000, default: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "sort_by", in: "query", schema: { type: "string", enum: ["created_at", "updated_at", "application_deadline", "start_date", "title"], default: "created_at" } },
          { name: "sort_order", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
          { name: "opportunity_type", in: "query", schema: { type: "string" } },
          { name: "employment_type", in: "query", schema: { type: "string" } },
          { name: "experience_level", in: "query", schema: { type: "string" } },
          { name: "work_arrangement", in: "query", schema: { type: "string" } },
          { name: "country", in: "query", schema: { type: "string", minLength: 2, maxLength: 2 } },
          { name: "status", in: "query", description: "Defaults to published. Accessing any other status requires an authenticated company administrator and company_id.", schema: { type: "string", enum: ["draft", "published", "paused", "closed"] } },
          { name: "is_paid", in: "query", schema: { type: "boolean" } },
          { name: "search", in: "query", schema: { type: "string", maxLength: 200 } },
          { name: "skills", in: "query", description: "Comma-separated skill names; all listed skills must match.", schema: { type: "string" } },
          { name: "company_id", in: "query", description: "With scope=company, lists every status for this company (admin only). Alternatively send company_id in a JSON request body.", schema: objectIdSchema },
          { name: "scope", in: "query", description: "Set to `company` to use company_id as the management listing.", schema: { type: "string", enum: ["company"] } },
        ],
        responses: {
          "200": {
            description: "A page of opportunities and total result metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OpportunityListResponse" },
              },
            },
          },
          "400": {
            description: "Invalid query parameter",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": { description: "Authentication is required for unpublished statuses" },
          "403": { description: "Active company administrator access is required" },
          "503": { description: "Company authorization service is unavailable" },
          "500": { description: "The opportunity search failed" },
        },
      },
      post: {
        tags: ["Opportunities"],
        summary: "Create an opportunity",
        security: [{ sessionCookie: [] }],
        description:
          "Requires an authenticated user with active ADMIN membership in company_id. The company name and creator are derived from trusted service data. When status is `published` and follower_recipients are included, queues a `job.published` event for notification-service.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOpportunityRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Opportunity created; notification_status reports queue outcome",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateOpportunityResponse" },
              },
            },
          },
          "400": {
            description: "Invalid opportunity",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
              },
            },
          },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access is required" },
          "503": { description: "Authentication or company authorization service is unavailable" },
          "500": { description: "Opportunity creation failed" },
        },
      },
    },
    "/opportunities/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: objectIdSchema,
        },
      ],
      get: {
        tags: ["Opportunities"],
        summary: "Get an opportunity by ID",
        description:
          "Published opportunities are public. Any other status requires an authenticated active company administrator.",
        responses: {
          "200": {
            description: "Opportunity record",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OpportunityResponse" },
              },
            },
          },
          "400": { description: "ID is not a valid ObjectId" },
          "401": { description: "Authentication is required for unpublished opportunities" },
          "403": { description: "Active company administrator access is required" },
          "404": { description: "Opportunity not found" },
          "503": { description: "Company authorization service is unavailable" },
          "500": { description: "The opportunity lookup failed" },
        },
      },
      put: {
        tags: ["Opportunities"],
        summary: "Update editable fields on an opportunity",
        security: [{ sessionCookie: [] }],
        description:
          "Requires an authenticated user with active ADMIN membership in the opportunity's company.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OpportunityUpdateRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Opportunity updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OpportunityResponse" },
              },
            },
          },
          "400": { description: "Invalid ID or update payload" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access is required" },
          "404": { description: "Opportunity not found" },
          "503": { description: "Authentication or company authorization service is unavailable" },
        },
      },
      patch: {
        tags: ["Opportunities"],
        summary: "Partially update an opportunity",
        security: [{ sessionCookie: [] }],
        description:
          "Requires an authenticated user with active ADMIN membership in the opportunity's company.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OpportunityUpdateRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Opportunity updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OpportunityResponse" },
              },
            },
          },
          "400": { description: "Invalid ID or update payload" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access is required" },
          "404": { description: "Opportunity not found" },
          "503": { description: "Authentication or company authorization service is unavailable" },
        },
      },
      delete: {
        tags: ["Opportunities"],
        summary: "Delete an opportunity",
        security: [{ sessionCookie: [] }],
        description:
          "Requires an authenticated user with active ADMIN membership in the opportunity's company.",
        responses: {
          "204": { description: "Opportunity deleted" },
          "400": { description: "ID is not a valid ObjectId" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access is required" },
          "404": { description: "Opportunity not found" },
          "503": { description: "Authentication or company authorization service is unavailable" },
        },
      },
    },
    "/saved-opportunities/ids": {
      get: {
        tags: ["Saved Opportunities"],
        summary: "Ids of every listing the signed-in user has saved",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "{ opportunity_ids: string[] }" },
          "401": { description: "Authentication is required" },
        },
      },
    },
    "/saved-opportunities": {
      get: {
        tags: ["Saved opportunities"],
        summary: "List the signed-in talent's saved opportunities",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: {
          "200": {
            description: "Saved opportunities, newest first",
            content: { "application/json": { schema: { $ref: "#/components/schemas/OpportunityListResponse" } } },
          },
          "400": { description: "Invalid pagination parameters" },
          "401": { description: "Authentication is required" },
        },
      },
    },
    "/saved-opportunities/{opportunityId}": {
      parameters: [
        { name: "opportunityId", in: "path", required: true, schema: objectIdSchema },
      ],
      get: {
        tags: ["Saved opportunities"],
        summary: "Check whether an opportunity is saved",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Saved status",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SavedStatusResponse" } } },
          },
          "400": { description: "Invalid opportunity id" },
          "401": { description: "Authentication is required" },
        },
      },
      put: {
        tags: ["Saved opportunities"],
        summary: "Save an opportunity (idempotent)",
        security: [{ sessionCookie: [] }],
        responses: {
          "201": {
            description: "Opportunity saved",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SavedStatusResponse" } } },
          },
          "200": {
            description: "Opportunity was already saved",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SavedStatusResponse" } } },
          },
          "400": { description: "Invalid opportunity id" },
          "401": { description: "Authentication is required" },
          "404": { description: "Opportunity not found" },
        },
      },
      delete: {
        tags: ["Saved opportunities"],
        summary: "Remove a saved opportunity",
        security: [{ sessionCookie: [] }],
        responses: {
          "204": { description: "Removed" },
          "400": { description: "Invalid opportunity id" },
          "401": { description: "Authentication is required" },
          "404": { description: "Saved opportunity not found" },
        },
      },
    },
    "/opportunities/drafts": {
      get: {
        tags: ["Drafts"],
        summary: "List a company's drafts (stored in Redis)",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "company_id", in: "query", required: true, schema: objectIdSchema }],
        responses: {
          "200": { description: "Drafts, newest first" },
          "400": { description: "Invalid company_id" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access required" },
          "503": { description: "Draft storage unavailable" },
        },
      },
      post: {
        tags: ["Drafts"],
        summary: "Save a new draft",
        description:
          "Drafts live only in Redis (30-day expiry, refreshed on every save) and never touch MongoDB. Accepts the listing fields without status. Publish by POSTing /opportunities with draft_id.",
        security: [{ sessionCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "201": { description: "Draft saved" },
          "400": { description: "Invalid draft payload" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access required" },
          "503": { description: "Draft storage unavailable" },
        },
      },
    },
    "/opportunities/drafts/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: objectIdSchema }],
      get: {
        tags: ["Drafts"],
        summary: "Get a draft",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "Draft" }, "403": { description: "Not a company admin" }, "404": { description: "Draft not found or expired" } },
      },
      put: {
        tags: ["Drafts"],
        summary: "Replace a draft",
        security: [{ sessionCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { type: "object" } } } },
        responses: { "200": { description: "Draft updated" }, "400": { description: "Invalid payload" }, "403": { description: "Not a company admin" }, "404": { description: "Draft not found or expired" } },
      },
      delete: {
        tags: ["Drafts"],
        summary: "Delete a draft",
        security: [{ sessionCookie: [] }],
        responses: { "204": { description: "Deleted" }, "403": { description: "Not a company admin" }, "404": { description: "Draft not found or expired" } },
      },
    },
    "/opportunities/{id}/eligibility": {
      parameters: [{ name: "id", in: "path", required: true, schema: objectIdSchema }],
      get: {
        tags: ["Applications"],
        summary: "Check whether the signed-in talent may apply",
        description:
          "Compares the talent's best graded assessment for the listing's role_id with the placement the listing requires (job listings need a 'job' placement; internships accept 'internship' or 'job').",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Eligibility state",
            content: { "application/json": { schema: { $ref: "#/components/schemas/EligibilityResponse" } } },
          },
          "400": { description: "Invalid opportunity id" },
          "401": { description: "Authentication is required" },
          "404": { description: "Opportunity not found or not published" },
        },
      },
    },
    "/opportunities/{id}/view": {
      parameters: [{ name: "id", in: "path", required: true, schema: objectIdSchema }],
      post: {
        tags: ["Opportunities"],
        summary: "Record a unique view of a listing",
        description:
          "Increments views_count once per signed-in user per listing. Repeat calls and views by the company's own admins are ignored (counted: false).",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Whether this call added a new view",
            content: {
              "application/json": {
                schema: { type: "object", properties: { counted: { type: "boolean" } } },
              },
            },
          },
          "400": { description: "Invalid opportunity id" },
          "401": { description: "Authentication is required" },
          "404": { description: "Opportunity not found or not published" },
        },
      },
    },
    "/opportunities/{id}/applications": {
      parameters: [{ name: "id", in: "path", required: true, schema: objectIdSchema }],
      post: {
        tags: ["Applications"],
        summary: "Apply to a listing",
        description:
          "Requires a session. The applicant is the session user and the CV is taken from their talent profile. Rejected with 403 unless the talent passed the assessment for the listing's role, 400 for external-apply listings, and 409 if they already applied. Stores an application (stage New, with a computed AI match) and emails the listing creator on a best-effort basis.",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: { cover_letter: { type: "string", maxLength: 3000 } },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Application created",
            content: { "application/json": { schema: { type: "object", properties: { application: { $ref: "#/components/schemas/Application" } } } } },
          },
          "400": { description: "Invalid input, external-apply listing, or account has no email" },
          "401": { description: "Authentication is required" },
          "403": {
            description: "Not eligible; the body includes the eligibility state",
            content: { "application/json": { schema: { $ref: "#/components/schemas/EligibilityResponse" } } },
          },
          "404": { description: "Opportunity not found or not published" },
          "409": { description: "You have already applied to this listing" },
        },
      },
    },
    "/opportunities/applications/mine": {
      get: {
        tags: ["Applications"],
        summary: "List the signed-in talent's applications",
        description: "Newest first (max 200), each joined with its listing and company name.",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Applications",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Application" } } } } } },
          },
          "401": { description: "Authentication is required" },
        },
      },
    },
    "/opportunities/applications/mine/ids": {
      get: {
        tags: ["Applications"],
        summary: "List the opportunity ids the signed-in talent applied to",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Opportunity ids",
            content: { "application/json": { schema: { type: "object", properties: { opportunity_ids: { type: "array", items: objectIdSchema } } } } },
          },
          "401": { description: "Authentication is required" },
        },
      },
    },
    "/opportunities/applications": {
      get: {
        tags: ["Applications"],
        summary: "List a company's applications (employer pipeline)",
        description: "Requires active administrator access to the company. Returns at most 500 applications with applicant profile summaries.",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "company_id", in: "query", required: true, schema: objectIdSchema },
          { name: "opportunity_id", in: "query", required: false, schema: objectIdSchema },
          { name: "stage", in: "query", required: false, schema: { $ref: "#/components/schemas/ApplicationStage" } },
        ],
        responses: {
          "200": {
            description: "Applications",
            content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Application" } } } } } },
          },
          "400": { description: "Invalid query" },
          "401": { description: "Authentication is required" },
          "403": { description: "Not an active administrator of this company" },
        },
      },
    },
    "/opportunities/applications/{applicationId}": {
      parameters: [{ name: "applicationId", in: "path", required: true, schema: objectIdSchema }],
      get: {
        tags: ["Applications"],
        summary: "Get one application (employer)",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Application with applicant details",
            content: { "application/json": { schema: { type: "object", properties: { application: { $ref: "#/components/schemas/Application" } } } } },
          },
          "401": { description: "Authentication is required" },
          "403": { description: "Not an active administrator of the listing's company" },
          "404": { description: "Application not found" },
        },
      },
      patch: {
        tags: ["Applications"],
        summary: "Move an application to another stage and/or save employer notes",
        description: "Stage changes must follow the allowed transitions (for example New to Reviewed, Shortlisted or Rejected). Withdrawn is reserved for the talent.",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  current_stage: { $ref: "#/components/schemas/ApplicationStage" },
                  employer_notes: { type: "string", maxLength: 5000 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated application",
            content: { "application/json": { schema: { type: "object", properties: { application: { $ref: "#/components/schemas/Application" } } } } },
          },
          "400": { description: "Invalid input" },
          "401": { description: "Authentication is required" },
          "403": { description: "Not an active administrator of the listing's company" },
          "404": { description: "Application not found" },
          "409": { description: "Stage transition not allowed" },
        },
      },
    },
    "/opportunities/applications/{applicationId}/withdraw": {
      parameters: [{ name: "applicationId", in: "path", required: true, schema: objectIdSchema }],
      post: {
        tags: ["Applications"],
        summary: "Withdraw your own application",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Withdrawn application",
            content: { "application/json": { schema: { type: "object", properties: { application: { $ref: "#/components/schemas/Application" } } } } },
          },
          "401": { description: "Authentication is required" },
          "404": { description: "Application not found (or not yours)" },
          "409": { description: "The application is already closed" },
        },
      },
    },
    "/opportunities/applications/{applicationId}/interviews": {
      parameters: [{ name: "applicationId", in: "path", required: true, schema: objectIdSchema }],
      get: {
        tags: ["Interviews"],
        summary: "List an application's interviews (the applicant or a company admin)",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Interviews, newest first", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Interview" } } } } } } },
          "401": { description: "Authentication is required" },
          "403": { description: "Not the applicant or a company admin" },
          "404": { description: "Application not found" },
        },
      },
      post: {
        tags: ["Interviews"],
        summary: "Invite the applicant to interview (company admin)",
        description: "Moves the application to the Interview stage and emails the applicant. Allowed from Reviewed, Shortlisted, Interview and Test Task, and only while no other interview is open.",
        security: [{ sessionCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/InterviewInput" } } } },
        responses: {
          "201": { description: "Interview created", content: { "application/json": { schema: { type: "object", properties: { interview: { $ref: "#/components/schemas/Interview" } } } } } },
          "400": { description: "Invalid input, or a time in the past" },
          "401": { description: "Authentication is required" },
          "403": { description: "Not a company admin" },
          "404": { description: "Application not found" },
          "409": { description: "Wrong stage, or an interview is already open" },
        },
      },
    },
    "/opportunities/interviews/mine": {
      get: {
        tags: ["Interviews"],
        summary: "The signed-in talent's interviews with listing and company details",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Interviews including listing_title, company_name and company_logo_url" },
          "401": { description: "Authentication is required" },
        },
      },
    },
    "/opportunities/interviews": {
      get: {
        tags: ["Interviews"],
        summary: "All interviews across a company's applicants (company admin)",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "company_id", in: "query", required: true, schema: objectIdSchema }],
        responses: {
          "200": { description: "Interviews including listing_title, applicant_id and applicant_name" },
          "401": { description: "Authentication is required" },
          "403": { description: "Not a company admin" },
        },
      },
    },
    "/opportunities/interviews/{interviewId}/respond": {
      parameters: [{ name: "interviewId", in: "path", required: true, schema: objectIdSchema }],
      post: {
        tags: ["Interviews"],
        summary: "Applicant confirms, declines or asks to reschedule",
        description: "Declining or asking to reschedule requires a reason. The hiring team is emailed.",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["response"],
                properties: {
                  response: { type: "string", enum: ["confirm", "decline", "reschedule"] },
                  reason: { type: "string", maxLength: 1000 },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated interview", content: { "application/json": { schema: { type: "object", properties: { interview: { $ref: "#/components/schemas/Interview" } } } } } },
          "400": { description: "Invalid response or missing reason" },
          "404": { description: "Interview not found (or not yours)" },
          "409": { description: "The interview can no longer be changed" },
        },
      },
    },
    "/opportunities/interviews/{interviewId}": {
      parameters: [{ name: "interviewId", in: "path", required: true, schema: objectIdSchema }],
      patch: {
        tags: ["Interviews"],
        summary: "Reschedule, cancel or complete an interview (company admin)",
        description: "Sending scheduled_at, format, meeting_url or message reschedules and asks the applicant to confirm again. status=cancelled cancels; status=completed requires an outcome and accepts feedback.",
        security: [{ sessionCookie: [] }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/InterviewUpdate" } } } },
        responses: {
          "200": { description: "Updated interview", content: { "application/json": { schema: { type: "object", properties: { interview: { $ref: "#/components/schemas/Interview" } } } } } },
          "400": { description: "Invalid input" },
          "403": { description: "Not a company admin" },
          "404": { description: "Interview not found" },
          "409": { description: "The interview is already closed" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
        description: "Session cookie returned by a successful Better Auth sign-in.",
      },
    },
    schemas: {
      ApplicationStage: {
        type: "string",
        enum: ["New", "Reviewed", "Shortlisted", "Interview", "Test Task", "Offer", "Hired", "Rejected", "Withdrawn"],
      },
      Application: {
        type: "object",
        properties: {
          id: objectIdSchema,
          opportunity_id: objectIdSchema,
          talent_id: objectIdSchema,
          cover_letter: { type: ["string", "null"] },
          cv_url: { type: ["string", "null"] },
          current_stage: { $ref: "#/components/schemas/ApplicationStage" },
          ai_match_score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
          ai_match_factors: {
            type: ["array", "null"],
            items: {
              type: "object",
              properties: { label: { type: "string" }, score: { type: "number" }, note: { type: "string" } },
            },
          },
          employer_notes: { type: ["string", "null"] },
          applied_at: { type: "string", format: "date-time" },
          updated_at: { type: ["string", "null"], format: "date-time" },
          opportunity: { type: ["object", "null"], description: "Talent view only: listing title, type, company id, name and company_logo_url" },
          listing_title: { type: ["string", "null"], description: "Employer view only" },
          applicant: { type: "object", description: "Employer view only: name, email, phone, career_goals, headline, location, skills, education, experience, availability, avatar_url" },
        },
      },
      InterviewInput: {
        type: "object",
        required: ["scheduled_at", "format"],
        properties: {
          scheduled_at: { type: "string", format: "date-time", description: "Must be in the future" },
          format: { type: "string", enum: ["video", "phone", "onsite"] },
          meeting_url: { type: ["string", "null"], format: "uri" },
          message: { type: ["string", "null"], maxLength: 2000 },
        },
      },
      InterviewUpdate: {
        type: "object",
        properties: {
          scheduled_at: { type: "string", format: "date-time" },
          format: { type: "string", enum: ["video", "phone", "onsite"] },
          meeting_url: { type: ["string", "null"], format: "uri" },
          message: { type: ["string", "null"] },
          status: { type: "string", enum: ["cancelled", "completed"] },
          outcome: { type: "string", enum: ["passed", "failed", "no_show"] },
          feedback: { type: ["string", "null"], maxLength: 5000 },
        },
      },
      Interview: {
        type: "object",
        properties: {
          id: objectIdSchema,
          application_id: objectIdSchema,
          requested_by: objectIdSchema,
          scheduled_at: { type: "string", format: "date-time" },
          format: { type: "string", enum: ["video", "phone", "onsite"] },
          meeting_url: { type: ["string", "null"] },
          message: { type: ["string", "null"] },
          status: { type: "string", enum: ["pending", "confirmed", "reschedule_requested", "declined", "completed", "cancelled"] },
          reschedule_reason: { type: ["string", "null"] },
          outcome: { type: ["string", "null"], enum: ["passed", "failed", "no_show", null] },
          feedback: { type: ["string", "null"] },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: ["string", "null"], format: "date-time" },
        },
      },
      EligibilityResponse: {
        type: "object",
        properties: {
          applied: { type: "boolean", description: "True when the signed-in talent already applied" },
          state: { type: "string", enum: ["eligible", "not-assessed", "not-eligible", "unconfigured", "closed"] },
          role_id: { type: ["string", "null"] },
          required_placement: { type: "string", enum: ["internship", "job"] },
          placement: { type: ["string", "null"], description: "The talent's best placement for this role" },
          overall_score: { type: ["number", "null"] },
        },
      },
      SavedStatusResponse: {
        type: "object",
        properties: {
          saved: { type: "boolean" },
          opportunity_id: objectIdSchema,
        },
      },
      Opportunity: {
        type: "object",
        required: opportunityRequired,
        properties: opportunityProperties,
      },
      CreateOpportunityRequest: {
        type: "object",
        required: [
          "company_id",
          ...opportunityRequired.filter((field) => field !== "source_type"),
        ],
        additionalProperties: false,
        properties: {
          company_id: objectIdSchema,
          source_type: { type: "string", default: "employer" },
          role_id: opportunityProperties.role_id,
          external_apply_url: opportunityProperties.external_apply_url,
          title: opportunityProperties.title,
          description: opportunityProperties.description,
          responsibilities: opportunityProperties.responsibilities,
          opportunity_type: opportunityProperties.opportunity_type,
          employment_type: opportunityProperties.employment_type,
          experience_level: opportunityProperties.experience_level,
          is_paid: opportunityProperties.is_paid,
          compensation_min: opportunityProperties.compensation_min,
          compensation_max: opportunityProperties.compensation_max,
          currency: opportunityProperties.currency,
          payment_frequency: opportunityProperties.payment_frequency,
          country: opportunityProperties.country,
          location: opportunityProperties.location,
          work_arrangement: opportunityProperties.work_arrangement,
          skills_required: opportunityProperties.skills_required,
          duration_weeks: opportunityProperties.duration_weeks,
          start_date: opportunityProperties.start_date,
          application_deadline: opportunityProperties.application_deadline,
          openings: opportunityProperties.openings,
          status: {
            type: "string",
            enum: ["draft", "published", "paused", "closed"],
          },
          follower_recipients: {
            type: "array",
            description: "Temporary trusted-caller input for company followers.",
            items: { $ref: "#/components/schemas/NotificationRecipient" },
          },
        },
      },
      OpportunityUpdateRequest: {
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: {
          role_id: opportunityProperties.role_id,
          external_apply_url: opportunityProperties.external_apply_url,
          title: opportunityProperties.title,
          description: opportunityProperties.description,
          responsibilities: opportunityProperties.responsibilities,
          opportunity_type: opportunityProperties.opportunity_type,
          employment_type: opportunityProperties.employment_type,
          experience_level: opportunityProperties.experience_level,
          is_paid: opportunityProperties.is_paid,
          compensation_min: opportunityProperties.compensation_min,
          compensation_max: opportunityProperties.compensation_max,
          currency: opportunityProperties.currency,
          payment_frequency: opportunityProperties.payment_frequency,
          country: opportunityProperties.country,
          location: opportunityProperties.location,
          work_arrangement: opportunityProperties.work_arrangement,
          skills_required: opportunityProperties.skills_required,
          duration_weeks: opportunityProperties.duration_weeks,
          start_date: opportunityProperties.start_date,
          application_deadline: opportunityProperties.application_deadline,
          openings: opportunityProperties.openings,
          status: {
            type: "string",
            enum: ["draft", "published", "paused", "closed"],
          },
        },
      },
      OpportunityResponse: {
        type: "object",
        required: ["opportunity"],
        properties: {
          opportunity: { $ref: "#/components/schemas/Opportunity" },
        },
      },
      CreateOpportunityResponse: {
        type: "object",
        required: ["opportunity", "notification_status"],
        properties: {
          opportunity: { $ref: "#/components/schemas/Opportunity" },
          notification_status: {
            type: "string",
            enum: [
              "queued",
              "failed_to_queue",
              "not_queued_no_follower_recipients",
              "not_queued_not_published",
            ],
          },
        },
      },
      OpportunityListResponse: {
        type: "object",
        required: ["data", "pagination", "sorting"],
        properties: {
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/Opportunity" },
          },
          pagination: {
            type: "object",
            required: ["page", "page_size", "total_items", "total_pages"],
            properties: {
              page: { type: "integer" },
              page_size: { type: "integer" },
              total_items: { type: "integer" },
              total_pages: { type: "integer" },
            },
          },
          sorting: {
            type: "object",
            required: ["sort_by", "sort_order"],
            properties: {
              sort_by: { type: "string" },
              sort_order: { type: "string", enum: ["asc", "desc"] },
            },
          },
        },
      },
      NotificationRecipient: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          name: { type: "string", maxLength: 120 },
        },
      },
      ApplicationNotificationRequest: {
        type: "object",
        required: ["applicant_name", "applicant_email", "company_email"],
        properties: {
          applicant_name: { type: "string", minLength: 1, maxLength: 120 },
          applicant_email: { type: "string", format: "email" },
          company_email: { type: "string", format: "email", description: "Temporary hiring-contact email input." },
          company_contact_name: { type: "string", maxLength: 120 },
        },
      },
      ApplicationNotificationResponse: {
        type: "object",
        required: ["status", "note"],
        properties: {
          status: { type: "string", const: "application_notification_queued" },
          note: { type: "string" },
        },
      },
      HealthResponse: {
        type: "object",
        required: ["status", "database", "rabbitmq"],
        properties: {
          status: { type: "string", enum: ["ok", "unavailable"] },
          database: { type: "string", enum: ["connected", "unavailable"] },
          rabbitmq: { type: "string", enum: ["connected", "unavailable"] },
        },
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
      ValidationError: {
        allOf: [
          { $ref: "#/components/schemas/ErrorResponse" },
          {
            type: "object",
            required: ["details"],
            properties: { details: { type: "object" } },
          },
        ],
      },
    },
  },
} as const;
