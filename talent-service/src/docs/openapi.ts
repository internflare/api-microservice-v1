export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Internflare Talent Service API",
    version: "1.0.0",
    description:
      "Autonomous microservice for Talent Profile CRUD, Completeness Scoring Engine, and Candidate Discovery (PRD §4.1 / US-01).",
  },
  servers: [{ url: "/", description: "Current talent-service origin" }],
  tags: [
    { name: "Talent Profile", description: "Talent profile creation, retrieval, and updating" },
    { name: "Talent Discovery", description: "Public and recruiter candidate search" },
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
            description: "UUID of the talent profile",
            schema: { type: "string", format: "uuid" },
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
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "talent-service" },
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
          id: { type: "string", format: "uuid" },
          user_id: { type: "string", format: "uuid" },
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

