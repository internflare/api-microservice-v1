const errorContent = {
  "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
};

// Shared multipart upload endpoint for CVs, profile images, logos and CAC documents
const uploadPath = () => ({
  post: {
    tags: ["Uploads"],
    summary: "Upload a file to Cloudflare R2",
    description:
      "Single upload endpoint. `purpose` selects the rules: cv (PDF/DOCX, 5 MB), avatar (JPG/PNG/WEBP, 2 MB), logo (JPG/PNG/WEBP, 2 MB), cac_document (PDF/JPG/PNG, 5 MB). Returns the public URL, which the caller saves with its onboarding or profile request.",
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    parameters: [
      {
        name: "purpose",
        in: "query",
        required: true,
        schema: { type: "string", enum: ["cv", "avatar", "logo", "cac_document"] },
      },
    ],
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: {
            type: "object",
            required: ["file"],
            properties: { file: { type: "string", format: "binary" } },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Uploaded. data: { url, purpose }",
        content: { "application/json": { schema: { type: "object" } } },
      },
      "400": { description: "Missing file, wrong type or content mismatch", content: errorContent },
      "401": { description: "Unauthorized", content: errorContent },
      "413": { description: "File too large", content: errorContent },
      "502": { description: "R2 upload failed", content: errorContent },
      "503": { description: "R2 not configured", content: errorContent },
    },
  },
});

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Internflare Talent Profile API",
    version: "1.0.0",
    description:
      "Talent profile CRUD, completeness scoring, and candidate discovery, hosted by profile-service (PRD §4.1 / US-01).",
  },
  servers: [{ url: "/", description: "Current profile-service origin" }],
  tags: [
    { name: "Talent Profile", description: "Talent profile creation, retrieval, and updating" },
    { name: "Talent Discovery", description: "Public and recruiter candidate search" },
    { name: "Uploads", description: "Shared file upload to Cloudflare R2" },
    { name: "Company", description: "Employer onboarding and team invitations" },
    { name: "Internal", description: "Service-to-service endpoints (x-internal-service-key)" },
    { name: "Health", description: "Service health and readiness probes" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Service liveness check",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/health": {
      get: {
        tags: ["Health"],
        summary: "API v1 health check",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/talent/profile": {
      post: {
        tags: ["Talent Profile"],
        summary: "Create or upsert talent profile",
        description:
          "Atomically creates or updates the authenticated talent's profile, and automatically recalculates profile completeness.",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateTalentProfileRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Profile created or updated successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileWithCompletenessResponse" },
              },
            },
          },
          "400": {
            description: "Validation failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized - missing or invalid session",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/talent/profile/me": {
      get: {
        tags: ["Talent Profile"],
        summary: "Get my profile and completeness score",
        description:
          "Returns the profile of the currently authenticated talent along with a detailed 100% completeness score breakdown, missing fields list, and actionable next prompt for the frontend onboarding banner.",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          "200": {
            description: "Profile retrieved successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileWithCompletenessResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "404": {
            description: "Profile does not exist yet (includes empty completeness recommendations)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotFoundWithCompletenessResponse" },
              },
            },
          },
        },
      },
      patch: {
        tags: ["Talent Profile"],
        summary: "Partially update talent profile",
        description:
          "Merges submitted fields into the existing profile and recalculates profile completeness.",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateTalentProfileRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Profile updated successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileWithCompletenessResponse" },
              },
            },
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/uploads": uploadPath(),
    "/api/v1/company/employer-onboarding": {
      post: {
        tags: ["Company"],
        summary: "Create the employer's company (onboarding submit)",
        description:
          "JSON, or multipart with a `data` JSON field plus `logo` and `cac_document` files. Optional `invites` are emailed signup links after the company is created; invite failures never fail onboarding.",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/EmployerOnboardingRequest" } },
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  data: { type: "string", description: "JSON of EmployerOnboardingRequest" },
                  logo: { type: "string", format: "binary" },
                  cac_document: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Company created; the caller becomes ACTIVE ADMIN" },
          "400": { description: "Validation failed", content: errorContent },
          "401": { description: "Unauthorized", content: errorContent },
        },
      },
    },
    "/api/v1/company/{id}/public": {
      get: {
        tags: ["Company"],
        summary: "Public company profile",
        description:
          "Name, logo, about, culture, follower count and published roles. Sign in to receive `is_following`. Cached in Redis for 60s; invalidated on company update and follow/unfollow.",
        security: [{}, { bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        responses: {
          "200": { description: "Company profile with `follower_count`, `is_following` and `open_opportunities`" },
          "404": { description: "Company not found", content: errorContent },
        },
      },
    },
    "/api/v1/company/{id}/follow": {
      put: {
        tags: ["Company"],
        summary: "Follow a company (idempotent)",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        responses: {
          "200": { description: "Followed" },
          "401": { description: "Unauthorized", content: errorContent },
          "404": { description: "Company not found", content: errorContent },
        },
      },
      delete: {
        tags: ["Company"],
        summary: "Unfollow a company (idempotent)",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        responses: {
          "200": { description: "Unfollowed" },
          "401": { description: "Unauthorized", content: errorContent },
        },
      },
    },
    "/api/v1/company/{id}/talent-pool": {
      get: {
        tags: ["Company"],
        summary: "Job-ready talent pool (company members only)",
        description:
          "Candidates whose latest completed assessment per role placed them for a job, joined with their profile. Private fields (email, phone, CV) are never returned. Cached in Redis for 120s.",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        responses: {
          "200": { description: "`talent` (PoolTalent[]), `routed_count` and `generated_at`" },
          "403": { description: "Active company membership required", content: errorContent },
        },
      },
    },
    "/api/v1/company/{id}/invites": {
      post: {
        tags: ["Company"],
        summary: "Email team invitations (company ADMIN only)",
        description:
          "Creates a single-use token (valid 7 days) per address and emails a link to the minimal join page. Re-inviting an address revokes its earlier pending invite. Returns per-address results.",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/TeamInvitesRequest" } } },
        },
        responses: {
          "201": {
            description: "At least one invitation was sent",
            content: { "application/json": { schema: { $ref: "#/components/schemas/TeamInvitesResponse" } } },
          },
          "400": { description: "Validation failed", content: errorContent },
          "403": { description: "Company ADMIN access required", content: errorContent },
          "404": { description: "Company not found", content: errorContent },
          "502": { description: "No invitation could be sent", content: errorContent },
        },
      },
    },
    "/internal/invites/{token}": {
      get: {
        tags: ["Internal"],
        summary: "Look up a usable invite (service-to-service)",
        description: "Requires the `x-internal-service-key` header. Used by auth-service.",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Invite details (company, email, role)" },
          "404": { description: "Invalid token", content: errorContent },
          "410": { description: "Invite expired, revoked or already used", content: errorContent },
        },
      },
    },
    "/internal/invites/{token}/accept": {
      post: {
        tags: ["Internal"],
        summary: "Link a new user to the inviting company (service-to-service)",
        description:
          "Requires the `x-internal-service-key` header. The user's email must match the invited address; the invite is claimed atomically and the user becomes an ACTIVE member.",
        parameters: [
          { name: "token", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["user_id", "email"],
                properties: { user_id: { type: "string" }, email: { type: "string", format: "email" } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Member linked" },
          "403": { description: "Email does not match the invitation", content: errorContent },
          "404": { description: "Invalid token", content: errorContent },
          "410": { description: "Invite expired, revoked or already used", content: errorContent },
        },
      },
    },
    "/api/v1/talent/profile/{id}": {
      get: {
        tags: ["Talent Discovery"],
        summary: "Get public profile by ID",
        description: "Public view of a talent's profile for recruiters and potential employers.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "MongoDB ObjectId of the talent profile",
            schema: { type: "string", pattern: "^[a-fA-F0-9]{24}$" },
          },
        ],
        responses: {
          "200": {
            description: "Public profile retrieved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SingleProfileResponse" },
              },
            },
          },
          "404": {
            description: "Profile not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/v1/talent/profiles": {
      get: {
        tags: ["Talent Discovery"],
        summary: "Search candidate directory",
        description:
          "Allows recruiters to discover talent candidates filtered by skills (accelerated with GIN indexes), country, availability, and minimum profile completeness.",
        parameters: [
          {
            name: "skills",
            in: "query",
            required: false,
            description: "Comma-separated skills (e.g. 'TypeScript,Node.js')",
            schema: { type: "string" },
          },
          {
            name: "country",
            in: "query",
            required: false,
            description: "Country code or country name",
            schema: { type: "string" },
          },
          {
            name: "availability",
            in: "query",
            required: false,
            description: "Availability status (e.g. 'immediate', '2_weeks')",
            schema: { type: "string" },
          },
          {
            name: "work_arrangement_pref",
            in: "query",
            required: false,
            description: "Work arrangement ('remote', 'hybrid', 'onsite', 'any')",
            schema: { type: "string" },
          },
          {
            name: "min_completeness",
            in: "query",
            required: false,
            description: "Minimum profile completeness score (0-100)",
            schema: { type: "integer", minimum: 0, maximum: 100 },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            description: "Maximum number of profiles to return",
            schema: { type: "integer", default: 20 },
          },
          {
            name: "offset",
            in: "query",
            required: false,
            description: "Pagination offset",
            schema: { type: "integer", default: 0 },
          },
        ],
        responses: {
          "200": {
            description: "List of matching candidates",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TalentListResponse" },
              },
            },
          },
          "400": {
            description: "Invalid query parameters",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "better-auth.session_token",
      },
    },
    schemas: {
      TeamInviteEntry: {
        type: "object",
        required: ["email"],
        properties: {
          email: { type: "string", format: "email" },
          workspace_role: { type: "string", enum: ["ADMIN", "MEMBER"], default: "ADMIN" },
        },
      },
      TeamInvitesRequest: {
        type: "object",
        required: ["invites"],
        properties: {
          invites: { type: "array", minItems: 1, maxItems: 20, items: { $ref: "#/components/schemas/TeamInviteEntry" } },
        },
      },
      TeamInvitesResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email: { type: "string" },
                sent: { type: "boolean" },
                error: { type: "string" },
              },
            },
          },
        },
      },
      EmployerOnboardingRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          website: { type: ["string", "null"], format: "uri" },
          industry: { type: ["string", "null"] },
          country: { type: ["string", "null"], description: "ISO 3166-1 alpha-2" },
          registration_number: { type: ["string", "null"] },
          invites: { type: "array", maxItems: 20, items: { $ref: "#/components/schemas/TeamInviteEntry" } },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "profile-service" },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["status", "service", "timestamp"],
      },
      EducationItem: {
        type: "object",
        properties: {
          institution: { type: "string", example: "Stanford University" },
          degree: { type: "string", example: "B.S. in Computer Science" },
          field_of_study: { type: "string", example: "Software Systems" },
          start_year: { type: "integer", example: 2018 },
          end_year: { type: "integer", nullable: true, example: 2022 },
        },
        required: ["institution", "degree"],
      },
      ExperienceItem: {
        type: "object",
        properties: {
          company: { type: "string", example: "Tech Corp" },
          title: { type: "string", example: "Software Engineer" },
          location: { type: "string", example: "San Francisco, CA" },
          start_date: { type: "string", example: "2022-06" },
          end_date: { type: "string", nullable: true, example: null },
          current: { type: "boolean", example: true },
          description: { type: "string", example: "Developing distributed backend services" },
        },
        required: ["company", "title"],
      },
      TalentProfile: {
        type: "object",
        properties: {
          id: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "MongoDB ObjectId" },
          user_id: { type: "string", pattern: "^[a-fA-F0-9]{24}$", description: "Better Auth user id (stored as ObjectId)" },
          full_name: { type: "string", nullable: true, example: "Jane Developer" },
          headline: { type: "string", nullable: true, example: "Senior Backend Engineer" },
          phone: { type: "string", nullable: true, example: "+1234567890" },
          country: { type: "string", nullable: true, example: "US" },
          location: { type: "string", nullable: true, example: "San Francisco, CA" },
          skills: {
            type: "array",
            items: { type: "string" },
            example: ["TypeScript", "Node.js", "PostgreSQL"],
          },
          preferred_roles: {
            type: "array",
            items: { type: "string" },
            example: ["Backend Engineer", "Software Architect"],
          },
          education: {
            type: "array",
            items: { $ref: "#/components/schemas/EducationItem" },
          },
          experience: {
            type: "array",
            items: { $ref: "#/components/schemas/ExperienceItem" },
          },
          availability: { type: "string", nullable: true, example: "immediate" },
          work_arrangement_pref: { type: "string", nullable: true, example: "remote" },
          career_goals: {
            type: "string",
            nullable: true,
            example: "Passionate about building scalable distributed systems.",
          },
          cv_url: {
            type: "string",
            nullable: true,
            example: "https://storage.internflare.com/cvs/jane_cv.pdf",
          },
          profile_completeness: { type: "integer", example: 100 },
          readiness_score: { type: "integer", example: 0 },
          created_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
        required: ["id", "user_id", "profile_completeness"],
      },
      MissingField: {
        type: "object",
        properties: {
          field: { type: "string", example: "experience" },
          label: { type: "string", example: "Work Experience" },
          weight: { type: "integer", example: 15 },
        },
        required: ["field", "label", "weight"],
      },
      CompletenessCalculation: {
        type: "object",
        properties: {
          score: { type: "integer", example: 85 },
          missing_fields: {
            type: "array",
            items: { $ref: "#/components/schemas/MissingField" },
          },
          next_prompt: {
            type: "string",
            nullable: true,
            example: "Add your work experience to boost your profile completeness by +15%!",
          },
          breakdown: {
            type: "object",
            properties: {
              basic_info: { type: "integer", example: 15 },
              contact_location: { type: "integer", example: 15 },
              skills: { type: "integer", example: 15 },
              preferred_roles: { type: "integer", example: 10 },
              education: { type: "integer", example: 15 },
              experience: { type: "integer", example: 0 },
              preferences_goals: { type: "integer", example: 10 },
              cv_url: { type: "integer", example: 5 },
            },
          },
        },
        required: ["score", "missing_fields", "breakdown"],
      },
      CreateTalentProfileRequest: {
        type: "object",
        properties: {
          full_name: { type: "string", example: "Jane Developer" },
          headline: { type: "string", example: "Senior Backend Engineer" },
          phone: { type: "string", example: "+1234567890" },
          country: { type: "string", example: "US" },
          location: { type: "string", example: "San Francisco, CA" },
          skills: {
            type: "array",
            items: { type: "string" },
            example: ["TypeScript", "Node.js", "PostgreSQL"],
          },
          preferred_roles: {
            type: "array",
            items: { type: "string" },
            example: ["Backend Engineer"],
          },
          education: {
            type: "array",
            items: { $ref: "#/components/schemas/EducationItem" },
          },
          experience: {
            type: "array",
            items: { $ref: "#/components/schemas/ExperienceItem" },
          },
          availability: { type: "string", example: "immediate" },
          work_arrangement_pref: { type: "string", example: "remote" },
          career_goals: {
            type: "string",
            example: "Passionate about building scalable distributed systems.",
          },
          cv_url: { type: "string", example: "https://storage.internflare.com/cvs/jane_cv.pdf" },
        },
      },
      UpdateTalentProfileRequest: {
        $ref: "#/components/schemas/CreateTalentProfileRequest",
      },
      ProfileWithCompletenessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              profile: { $ref: "#/components/schemas/TalentProfile" },
              completeness: { $ref: "#/components/schemas/CompletenessCalculation" },
            },
            required: ["profile", "completeness"],
          },
        },
        required: ["success", "data"],
      },
      NotFoundWithCompletenessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "string", example: "Not Found" },
          message: { type: "string", example: "Talent profile has not been created yet." },
          completeness: { $ref: "#/components/schemas/CompletenessCalculation" },
        },
        required: ["success", "error", "completeness"],
      },
      SingleProfileResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "object",
            properties: {
              profile: { $ref: "#/components/schemas/TalentProfile" },
            },
            required: ["profile"],
          },
        },
        required: ["success", "data"],
      },
      TalentListResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/TalentProfile" },
          },
          pagination: {
            type: "object",
            properties: {
              total: { type: "integer", example: 42 },
              limit: { type: "integer", example: 20 },
              offset: { type: "integer", example: 0 },
            },
            required: ["total", "limit", "offset"],
          },
        },
        required: ["success", "data", "pagination"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "string", example: "Validation Error" },
          message: { type: "string", example: "Descriptive error message" },
        },
        required: ["success", "error"],
      },
      UnavailableResponse: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", const: "unavailable" } },
      },
    },
  },
} as const;
