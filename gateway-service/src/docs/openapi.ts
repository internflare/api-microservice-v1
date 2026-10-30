export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Internflare API",
    version: "1.0.0",
    description:
      "Unified API served through gateway-service. All versioned routes use /api/v1 and are routed to their owning backend service.",
  },
  servers: [{ url: "/", description: "Current gateway origin" }],
  tags: [
    { name: "Gateway", description: "Gateway liveness endpoint" },
    { name: "Authentication", description: "Session and auth endpoints" },
    {
      name: "Companies",
      description: "Company, employer and verification endpoints",
    },
    {
      name: "Talent Profiles",
      description: "Talent profile and onboarding endpoints",
    },
    {
      name: "Opportunities",
      description: "Job listing endpoints",
    },
    {
      name: "Applications",
      description: "Talent applications and the employer hiring pipeline",
    },
    {
      name: "Interviews",
      description: "Interview scheduling, confirmation, rescheduling and outcomes",
    },
    { name: "Notifications", description: "Email notification endpoints" },
    {
      name: "AI Assessments",
      description:
        "OpenAI-powered talent assessments, grading and placement",
    },
    { name: "AI Listings", description: "AI-drafted listing descriptions" },
    { name: "Team Invites", description: "Email invitations that attach teammates to a company" },
    { name: "Saved Opportunities", description: "A talent's bookmarked listings" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Gateway"],
        summary: "Gateway health",
        responses: { "200": { description: "Gateway is healthy" } },
      },
    },
    "/api/auth/{path}": {
      get: {
        tags: ["Authentication"],
        summary: "Forward Better Auth endpoint",
        parameters: [
          { name: "path", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Forwarded auth response" },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        tags: ["Authentication"],
        summary: "Forward Better Auth endpoint",
        parameters: [
          { name: "path", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "200": { description: "Forwarded auth response" },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/api/v1/me": {
      get: {
        tags: ["Authentication"],
        summary: "Get current session user",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Current authenticated user" },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/v1/company": {
      post: {
        tags: ["Companies"],
        summary: "Create or update a company during onboarding",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "200": { description: "Company saved" },
          "401": { description: "Authentication required" },
        },
      },
      get: {
        tags: ["Companies"],
        summary: "List companies managed by current user",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "Companies" } },
      },
    },
    "/api/v1/company/{id}": {
      get: {
        tags: ["Companies"],
        summary: "Get company detail",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "MongoDB ObjectId" } },
        ],
        responses: { "200": { description: "Company detail" }, "404": { description: "Not found" } },
      },
    },
    "/api/v1/company/employer-onboarding": {
      post: {
        tags: ["Companies"],
        summary: "Submit employer onboarding (creates the company)",
        description:
          "JSON, or multipart with a `data` JSON field plus `logo` and `cac_document` files stored in R2 after validation. `invites` ([{email, workspace_role}]) are emailed signup links.",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { type: "object" } },
            "multipart/form-data": { schema: { type: "object" } },
          },
        },
        responses: {
          "201": { description: "Company created" },
          "400": { description: "Validation error" },
          "401": { description: "Authentication required" },
        },
      },
    },
    "/api/v1/company/{id}/public": {
      get: {
        tags: ["Companies"],
        summary: "Public company profile with follower count and open roles",
        description: "Open to visitors; signed-in callers also receive `is_following`.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        responses: { "200": { description: "Company profile" }, "404": { description: "Company not found" } },
      },
    },
    "/api/v1/company/{id}/follow": {
      put: {
        tags: ["Companies"],
        summary: "Follow a company",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        responses: { "200": { description: "Followed" }, "401": { description: "Authentication required" } },
      },
      delete: {
        tags: ["Companies"],
        summary: "Unfollow a company",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        responses: { "200": { description: "Unfollowed" }, "401": { description: "Authentication required" } },
      },
    },
    "/api/v1/company/{id}/talent-pool": {
      get: {
        tags: ["Companies"],
        summary: "Job-ready talent pool from completed assessments (company members only)",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        responses: { "200": { description: "Talent pool" }, "403": { description: "Company membership required" } },
      },
    },
    "/api/v1/company/{id}/invites": {
      post: {
        tags: ["Team Invites"],
        summary: "Email team invitations (company admin only)",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["invites"],
                properties: {
                  invites: {
                    type: "array",
                    minItems: 1,
                    maxItems: 20,
                    items: {
                      type: "object",
                      required: ["email"],
                      properties: {
                        email: { type: "string", format: "email" },
                        workspace_role: { type: "string", enum: ["ADMIN", "MEMBER"], default: "ADMIN" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Invitations sent; per-address results returned" },
          "403": { description: "Company admin access required" },
          "502": { description: "No invitation could be sent" },
        },
      },
    },
    "/api/v1/invites/{token}": {
      get: {
        tags: ["Team Invites"],
        summary: "Look up an invitation (public)",
        description: "Returns the company name, invited email and role so the join page can greet the invitee.",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Invitation details" },
          "404": { description: "Invalid link" },
          "410": { description: "Expired, revoked or already used" },
        },
      },
    },
    "/api/v1/invites/signup": {
      post: {
        tags: ["Team Invites"],
        summary: "Create an invited teammate's account (public)",
        description:
          "Collects only name and password. The email comes from the invitation and is marked verified; the new user is linked to the inviting company as an active member.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "name", "password"],
                properties: {
                  token: { type: "string" },
                  name: { type: "string", minLength: 2, maxLength: 120 },
                  password: { type: "string", minLength: 8, maxLength: 128 },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Account created; sign in with the invited email" },
          "400": { description: "Validation error" },
          "409": { description: "An account with this email already exists" },
          "410": { description: "Invitation expired, revoked or already used" },
        },
      },
    },
    "/api/v1/saved-opportunities/ids": {
      get: {
        tags: ["Saved Opportunities"],
        summary: "Ids of every listing the signed-in user has saved",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "{ opportunity_ids: string[] }" }, "401": { description: "Not signed in" } },
      },
    },
    "/api/v1/saved-opportunities": {
      get: {
        tags: ["Saved Opportunities"],
        summary: "List the signed-in talent's saved opportunities",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        ],
        responses: { "200": { description: "Saved opportunities" }, "401": { description: "Authentication required" } },
      },
    },
    "/api/v1/saved-opportunities/{opportunityId}": {
      parameters: [
        { name: "opportunityId", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
      ],
      get: {
        tags: ["Saved Opportunities"],
        summary: "Check whether an opportunity is saved",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "{ saved, opportunity_id }" } },
      },
      put: {
        tags: ["Saved Opportunities"],
        summary: "Save an opportunity (idempotent)",
        security: [{ sessionCookie: [] }],
        responses: {
          "201": { description: "Saved" },
          "200": { description: "Already saved" },
          "404": { description: "Opportunity not found" },
        },
      },
      delete: {
        tags: ["Saved Opportunities"],
        summary: "Remove a saved opportunity",
        security: [{ sessionCookie: [] }],
        responses: { "204": { description: "Removed" }, "404": { description: "Not saved" } },
      },
    },
    "/api/v1/ai/listings/description": {
      post: {
        tags: ["AI Listings"],
        summary: "Draft a listing description with AI",
        description: "Requires sign-in; 10 requests per minute. Only `title` is required.",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title"],
                properties: {
                  title: { type: "string", minLength: 2 },
                  company_name: { type: "string" },
                  opportunity_type: { type: "string" },
                  experience_level: { type: "string" },
                  work_arrangement: { type: "string" },
                  location: { type: "string" },
                  duration: { type: "string" },
                  is_paid: { type: "boolean" },
                  skills: { type: "array", items: { type: "string" } },
                  responsibilities: { type: "array", items: { type: "string" } },
                  requirements: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "{ description }" },
          "400": { description: "Invalid input" },
          "429": { description: "Rate limit reached" },
          "502": { description: "AI provider failed" },
        },
      },
    },
    "/api/v1/employer/dashboard": {
      get: {
        tags: ["Companies"],
        summary: "Employer dashboard summary",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "Dashboard data" }, "401": { description: "Authentication required" } },
      },
    },
    "/api/v1/talent/profile/me": {
      get: {
        tags: ["Talent Profiles"],
        summary: "Get current talent profile",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Talent profile" },
          "404": { description: "Profile not found" },
        },
      },
      post: {
        tags: ["Talent Profiles"],
        summary: "Create or update current talent profile",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "200": { description: "Talent profile saved" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/api/v1/job/listing": {
      get: {
        tags: ["Opportunities"],
        summary: "List opportunity records for a company",
        description:
          "Forwarded to jobListing-service. Supports pagination via page and page_size.",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          {
            name: "page_size",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: { "200": { description: "Opportunity list" }, "401": { description: "Authentication required" } },
      },
      post: {
        tags: ["Opportunities"],
        summary: "Create a new opportunity listing",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "201": { description: "Opportunity created" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/api/v1/job/listing/{id}": {
      get: {
        tags: ["Opportunities"],
        summary: "Get one opportunity listing",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "MongoDB ObjectId" } },
        ],
        responses: { "200": { description: "Opportunity detail" }, "404": { description: "Not found" } },
      },
      patch: {
        tags: ["Opportunities"],
        summary: "Update an opportunity listing",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "MongoDB ObjectId" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "200": { description: "Opportunity updated" } },
      },
      delete: {
        tags: ["Opportunities"],
        summary: "Delete an opportunity listing",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "MongoDB ObjectId" } },
        ],
        responses: { "200": { description: "Opportunity deleted" } },
      },
    },
    "/api/v1/job/listing/drafts": {
      get: {
        tags: ["Opportunities"],
        summary: "List a company's drafts (Redis-only)",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "company_id", in: "query", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        responses: { "200": { description: "Drafts, newest first" }, "401": { description: "Not signed in" }, "403": { description: "Not a company admin" } },
      },
      post: {
        tags: ["Opportunities"],
        summary: "Save a new draft (stored in Redis, not the database)",
        description: "Same fields as a listing without status. Publish by creating a listing with draft_id.",
        security: [{ sessionCookie: [] }],
        responses: { "201": { description: "Draft saved" }, "400": { description: "Invalid payload" }, "403": { description: "Not a company admin" }, "503": { description: "Draft storage unavailable" } },
      },
    },
    "/api/v1/job/listing/drafts/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "Draft id" } },
      ],
      get: { tags: ["Opportunities"], summary: "Get a draft", security: [{ sessionCookie: [] }], responses: { "200": { description: "Draft" }, "404": { description: "Draft not found or expired" } } },
      put: { tags: ["Opportunities"], summary: "Replace a draft", security: [{ sessionCookie: [] }], responses: { "200": { description: "Draft updated" }, "404": { description: "Draft not found or expired" } } },
      delete: { tags: ["Opportunities"], summary: "Delete a draft", security: [{ sessionCookie: [] }], responses: { "204": { description: "Deleted" }, "404": { description: "Draft not found or expired" } } },
    },
    "/api/v1/job/listing/{id}/eligibility": {
      get: {
        tags: ["Opportunities"],
        summary: "Check whether the signed-in talent may apply to a listing",
        description: "Eligible only if the talent passed the assessment for the listing's role_id at the required placement. States: eligible, not-assessed, not-eligible, unconfigured, closed.",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "MongoDB ObjectId" } },
        ],
        responses: { "200": { description: "Eligibility state" }, "401": { description: "Not signed in" }, "404": { description: "Listing not found" } },
      },
    },
    "/api/v1/job/listing/{id}/view": {
      post: {
        tags: ["Opportunities"],
        summary: "Record a unique view of a listing",
        description: "Counts one view per signed-in user per listing (repeat views and the owning company's admins are ignored). Powers the employer's views_count.",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "MongoDB ObjectId" } },
        ],
        responses: { "200": { description: "{ counted: boolean }" }, "401": { description: "Not signed in" }, "404": { description: "Listing not found" } },
      },
    },
    "/api/v1/job/listing/{id}/applications": {
      post: {
        tags: ["Applications"],
        summary: "Apply to a listing",
        description: "The applicant is the signed-in user and the CV comes from their profile. Optional body: { cover_letter }. 403 when the talent hasn't passed the assessment for the listing's role, 409 if already applied.",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "MongoDB ObjectId" } },
        ],
        requestBody: {
          required: false,
          content: { "application/json": { schema: { type: "object", properties: { cover_letter: { type: "string", maxLength: 3000 } } } } },
        },
        responses: { "201": { description: "{ application }" }, "400": { description: "Invalid input or external-apply listing" }, "401": { description: "Not signed in" }, "403": { description: "Not eligible" }, "404": { description: "Listing not found" }, "409": { description: "Already applied" } },
      },
    },
    "/api/v1/job/listing/applications/mine": {
      get: {
        tags: ["Applications"],
        summary: "List the signed-in talent's applications",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "{ data: Application[] } with listing and company name" }, "401": { description: "Not signed in" } },
      },
    },
    "/api/v1/job/listing/applications/mine/ids": {
      get: {
        tags: ["Applications"],
        summary: "List opportunity ids the signed-in talent applied to",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "{ opportunity_ids: string[] }" }, "401": { description: "Not signed in" } },
      },
    },
    "/api/v1/job/listing/applications": {
      get: {
        tags: ["Applications"],
        summary: "List a company's applications (employer pipeline)",
        description: "Requires active administrator access to the company.",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "company_id", in: "query", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
          { name: "opportunity_id", in: "query", required: false, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
          { name: "stage", in: "query", required: false, schema: { type: "string", enum: ["New", "Reviewed", "Shortlisted", "Interview", "Test Task", "Offer", "Hired", "Rejected", "Withdrawn"] } },
        ],
        responses: { "200": { description: "{ data: Application[] } with applicant summaries" }, "401": { description: "Not signed in" }, "403": { description: "Not a company admin" } },
      },
    },
    "/api/v1/job/listing/applications/{applicationId}": {
      get: {
        tags: ["Applications"],
        summary: "Get one application (employer)",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "applicationId", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        responses: { "200": { description: "{ application }" }, "401": { description: "Not signed in" }, "403": { description: "Not a company admin" }, "404": { description: "Not found" } },
      },
      patch: {
        tags: ["Applications"],
        summary: "Change an application's stage and/or employer notes",
        description: "Stage moves must follow the allowed transitions (409 otherwise). Withdrawn is reserved for the talent.",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "applicationId", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  current_stage: { type: "string", enum: ["New", "Reviewed", "Shortlisted", "Interview", "Test Task", "Offer", "Hired", "Rejected"] },
                  employer_notes: { type: "string", maxLength: 5000 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "{ application }" }, "400": { description: "Invalid input" }, "403": { description: "Not a company admin" }, "404": { description: "Not found" }, "409": { description: "Transition not allowed" } },
      },
    },
    "/api/v1/job/listing/applications/{applicationId}/withdraw": {
      post: {
        tags: ["Applications"],
        summary: "Withdraw your own application",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "applicationId", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        responses: { "200": { description: "{ application }" }, "401": { description: "Not signed in" }, "404": { description: "Not found (or not yours)" }, "409": { description: "Already closed" } },
      },
    },
    "/api/v1/job/listing/applications/{applicationId}/interviews": {
      get: {
        tags: ["Interviews"],
        summary: "List an application's interviews (applicant or company admin)",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "applicationId", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        responses: { "200": { description: "{ data: Interview[] }" }, "401": { description: "Not signed in" }, "403": { description: "Not allowed" }, "404": { description: "Not found" } },
      },
      post: {
        tags: ["Interviews"],
        summary: "Invite the applicant to interview (company admin)",
        description: "Moves the application to Interview and emails the applicant. Allowed from Reviewed, Shortlisted, Interview and Test Task while no other interview is open.",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "applicationId", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["scheduled_at", "format"],
                properties: {
                  scheduled_at: { type: "string", format: "date-time", description: "Must be in the future" },
                  format: { type: "string", enum: ["video", "phone", "onsite"] },
                  meeting_url: { type: "string", format: "uri" },
                  message: { type: "string", maxLength: 2000 },
                },
              },
            },
          },
        },
        responses: { "201": { description: "{ interview }" }, "400": { description: "Invalid input or a past time" }, "403": { description: "Not a company admin" }, "404": { description: "Not found" }, "409": { description: "Wrong stage or an interview is already open" } },
      },
    },
    "/api/v1/job/listing/interviews/mine": {
      get: {
        tags: ["Interviews"],
        summary: "The signed-in talent's interviews (with listing and company logo)",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "{ data: Interview[] }" }, "401": { description: "Not signed in" } },
      },
    },
    "/api/v1/job/listing/interviews": {
      get: {
        tags: ["Interviews"],
        summary: "A company's interviews (company admin)",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "company_id", in: "query", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        responses: { "200": { description: "{ data: Interview[] } with applicant names" }, "401": { description: "Not signed in" }, "403": { description: "Not a company admin" } },
      },
    },
    "/api/v1/job/listing/interviews/{interviewId}/respond": {
      post: {
        tags: ["Interviews"],
        summary: "Applicant confirms, declines or asks to reschedule",
        description: "Declining or rescheduling needs a reason. The hiring team is emailed.",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "interviewId", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
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
        responses: { "200": { description: "{ interview }" }, "400": { description: "Invalid input" }, "404": { description: "Not found (or not yours)" }, "409": { description: "No longer changeable" } },
      },
    },
    "/api/v1/job/listing/interviews/{interviewId}": {
      patch: {
        tags: ["Interviews"],
        summary: "Reschedule, cancel or complete an interview (company admin)",
        description: "Changing scheduled_at/format/meeting_url/message reschedules (the applicant must confirm again). status=cancelled cancels; status=completed requires an outcome.",
        security: [{ sessionCookie: [] }],
        parameters: [{ name: "interviewId", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  scheduled_at: { type: "string", format: "date-time" },
                  format: { type: "string", enum: ["video", "phone", "onsite"] },
                  meeting_url: { type: "string", format: "uri" },
                  message: { type: "string" },
                  status: { type: "string", enum: ["cancelled", "completed"] },
                  outcome: { type: "string", enum: ["passed", "failed", "no_show"] },
                  feedback: { type: "string", maxLength: 5000 },
                },
              },
            },
          },
        },
        responses: { "200": { description: "{ interview }" }, "400": { description: "Invalid input" }, "403": { description: "Not a company admin" }, "404": { description: "Not found" }, "409": { description: "Already closed" } },
      },
    },
    "/api/v1/notifications": {
      post: {
        tags: ["Notifications"],
        summary: "Send a transactional notification",
        description: "Forwarded to notification-service.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "200": { description: "Notification sent" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/api/v1/ai/assessments/suggestion": {
      get: {
        tags: ["AI Assessments"],
        summary: "Suggest role and level from talent profile",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Suggested role and level" },
          "409": { description: "Complete onboarding first" },
        },
      },
    },
    "/api/v1/ai/assessments": {
      get: {
        tags: ["AI Assessments"],
        summary: "List completed assessments for current user",
        security: [{ sessionCookie: [] }],
        responses: { "200": { description: "Assessments" } },
      },
      post: {
        tags: ["AI Assessments"],
        summary: "Start a new assessment",
        security: [{ sessionCookie: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  role_id: { type: "string", example: "backend-engineer" },
                  level: { type: "string", enum: ["intern", "junior", "mid", "senior"] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Attempt created with questions" },
          "422": { description: "Role could not be inferred" },
          "429": { description: "Daily attempt limit reached" },
        },
      },
    },
    "/api/v1/ai/assessments/{id}/submit": {
      post: {
        tags: ["AI Assessments"],
        summary: "Submit assessment answers and metrics",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["responses", "metrics"],
                properties: {
                  responses: {
                    type: "object",
                    description: "Map: questionId -> { choice?, text?, code? }",
                    additionalProperties: { type: "object" },
                  },
                  metrics: {
                    type: "object",
                    required: ["goal", "confidence", "weekly_hours", "has_shipped_work"],
                    properties: {
                      goal: { type: "string", enum: ["internship", "job", "exploring"] },
                      confidence: { type: "integer", minimum: 1, maximum: 5 },
                      weekly_hours: { type: "integer", minimum: 0, maximum: 80 },
                      has_shipped_work: { type: "boolean" },
                      portfolio_url: { type: "string", format: "uri" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Graded results and placement" },
          "404": { description: "Assessment not found" },
          "409": { description: "Assessment already submitted" },
        },
      },
    },
    "/api/v1/ai/assessments/{id}": {
      get: {
        tags: ["AI Assessments"],
        summary: "Get one assessment status/result",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Assessment" }, "404": { description: "Not found" } },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
      },
    },
  },
};
