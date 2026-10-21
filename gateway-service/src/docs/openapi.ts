export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Internflare API",
    version: "1.0.0",
    description:
      "Unified public API for Internflare. All versioned routes use /api/v1 and are routed by this gateway to the owning backend service. Better Auth endpoints are available at /api/auth without a version prefix.",
  },
  servers: [{ url: "/", description: "Current gateway origin" }],
  tags: [
    { name: "Gateway", description: "Gateway health" },
    {
      name: "Authentication",
      description: "Better Auth and session endpoints",
    },
    {
      name: "Companies",
      description: "Company profiles, membership, and verification",
    },
    {
      name: "Talent Profiles",
      description: "Talent profiles, completeness, and candidate discovery",
    },
    { name: "Administration", description: "Platform administrator endpoints" },
    {
      name: "Internal",
      description: "Authenticated service-to-service endpoints",
    },
    {
      name: "Opportunities",
      description: "Opportunity listings and applications",
    },
    { name: "Notifications", description: "Transactional email notifications" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Gateway"],
        summary: "Check gateway liveness",
        responses: {
          "200": {
            description: "Gateway is accepting requests",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["status"],
                  properties: { status: { type: "string", const: "ok" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/health": {
      get: {
        tags: ["Gateway"],
        summary: "Check auth service health",
        description: "Forwarded to auth-service.",
        responses: {
          "200": { description: "Auth service and database are healthy" },
          "503": { description: "Auth service database is unavailable" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/v1/me": {
      get: {
        tags: ["Authentication"],
        summary: "Get the current user and session",
        description: "Forwarded to auth-service; provide the session cookie.",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Current session and user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "Better Auth session and user.",
                },
              },
            },
          },
          "401": { description: "No valid session cookie was provided" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/auth/sign-up/email": {
      post: {
        tags: ["Authentication"],
        summary: "Create an account with email and password",
        description:
          "Forwarded unchanged to Better Auth. Welcome and email-verification events are published after account creation. Email/password users must verify before signing in; the verification email contains a button that continues to the requested onboarding callback.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EmailSignUpRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Account created; check email to verify before continuing onboarding" },
          "400": { description: "Invalid sign-up request" },
          "429": { description: "Too many requests" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/auth/sign-in/email": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in with email and password",
        description:
          "Forwarded unchanged to Better Auth. Email/password accounts must verify their email address before a session can be created.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EmailSignInRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Sign-in succeeded; session cookie is returned",
          },
          "401": { description: "Invalid email or password, or email verification is required" },
          "429": { description: "Too many requests" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/auth/sign-in/social": {
      post: {
        tags: ["Authentication"],
        summary: "Start a social sign-in",
        description:
          "Forwarded unchanged to Better Auth. Configured providers are Google, Apple, X (Twitter), and LinkedIn.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SocialSignInRequest" },
            },
          },
        },
        responses: {
          "200": {
            description: "Sign-in URL returned or browser redirect initiated",
          },
          "400": { description: "Invalid provider or sign-in request" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/auth/callback/{provider}": {
      parameters: [
        {
          name: "provider",
          in: "path",
          required: true,
          schema: {
            type: "string",
            enum: ["google", "apple", "twitter", "linkedin"],
          },
        },
      ],
      get: {
        tags: ["Authentication"],
        summary: "Complete a social sign-in callback",
        description:
          "OAuth providers redirect to this Better Auth callback through the gateway.",
        responses: {
          "302": { description: "Redirect to the configured post-sign-in URL" },
          "400": { description: "OAuth callback could not be validated" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/auth/sign-out": {
      post: {
        tags: ["Authentication"],
        summary: "Sign out the current session",
        description:
          "Forwarded unchanged to Better Auth; provide the session cookie.",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Session signed out" },
          "401": { description: "No valid session was provided" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/auth/verify-email": {
      get: {
        tags: ["Authentication"],
        summary: "Verify an email address",
        description:
          "Better Auth validates the one-time verification token from the email link, verifies the address, and redirects to the sign-up callback URL.",
        parameters: [
          {
            name: "token",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "callbackURL",
            in: "query",
            required: false,
            schema: { type: "string", format: "uri" },
          },
        ],
        responses: {
          "302": { description: "Email verified; redirected to onboarding" },
          "400": { description: "Verification token is invalid or expired" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/auth/get-session": {
      get: {
        tags: ["Authentication"],
        summary: "Get the Better Auth session",
        description:
          "Forwarded unchanged to Better Auth; provide the session cookie.",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Current session, or null when signed out" },
          "401": { description: "Session is not valid" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/v1/company/employer-onboarding": {
      post: {
        tags: ["Companies"],
        summary: "Create a company",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCompanyRequest" },
            },
          },
        },
        responses: {
          "201": {
            description:
              "Company created; creator is registered as an administrator",
          },
          "400": { description: "Company details failed validation" },
          "401": { description: "No valid session cookie was provided" },
          "502": { description: "Company service is unavailable" },
        },
      },
    },
    "/api/v1/company/mine": {
      get: {
        tags: ["Companies"],
        summary: "List the current user's active administrator companies",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Companies where the current user is an active administrator",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["companies"],
                  properties: {
                    companies: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["id", "name"],
                        properties: {
                          id: { type: "string", format: "uuid" },
                          name: { type: "string" },
                          country: { type: ["string", "null"] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication is required" },
          "502": { description: "Company service is unavailable" },
        },
      },
    },
    "/api/v1/company/{id}": {
      parameters: [{ $ref: "#/components/parameters/CompanyId" }],
      get: {
        tags: ["Companies"],
        summary: "Get a company profile",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Company profile" },
          "401": { description: "Authentication is required" },
          "403": { description: "User is not a member of this company" },
          "404": { description: "Company not found" },
        },
      },
      patch: {
        tags: ["Companies"],
        summary: "Update a company profile",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateCompanyRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Company profile updated" },
          "400": { description: "Company details failed validation" },
          "401": { description: "Authentication is required" },
          "403": { description: "Administrator access is required" },
          "404": { description: "Company not found" },
        },
      },
    },
    "/api/v1/company/{id}/members": {
      parameters: [{ $ref: "#/components/parameters/CompanyId" }],
      get: {
        tags: ["Companies"],
        summary: "List company members",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Company members and their statuses" },
          "401": { description: "Authentication is required" },
          "403": { description: "User is not a member of this company" },
        },
      },
    },
    "/api/v1/company/{id}/members/invite": {
      parameters: [{ $ref: "#/components/parameters/CompanyId" }],
      post: {
        tags: ["Companies"],
        summary: "Invite a user to a company",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/InviteMemberRequest" },
            },
          },
        },
        responses: {
          "201": { description: "Member invitation created" },
          "400": { description: "Invalid invitation" },
          "401": { description: "Authentication is required" },
          "403": { description: "Company administrator access is required" },
          "409": {
            description: "User is already a member or has a pending invitation",
          },
        },
      },
    },
    "/api/v1/company/{id}/members/accept": {
      parameters: [{ $ref: "#/components/parameters/CompanyId" }],
      post: {
        tags: ["Companies"],
        summary: "Accept the current user's company invitation",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Invitation accepted" },
          "401": { description: "Authentication is required" },
          "404": { description: "No pending invitation was found" },
        },
      },
    },
    "/api/v1/company/{id}/members/{memberId}": {
      parameters: [
        { $ref: "#/components/parameters/CompanyId" },
        {
          name: "memberId",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      delete: {
        tags: ["Companies"],
        summary: "Remove a company member",
        description:
          "Revokes member access without deleting the member record.",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Member access revoked" },
          "400": {
            description:
              "The sole active company administrator cannot be removed",
          },
          "401": { description: "Authentication is required" },
          "403": { description: "Company administrator access is required" },
          "404": { description: "Member not found" },
        },
      },
    },
    "/api/v1/company/{id}/verifications": {
      parameters: [{ $ref: "#/components/parameters/CompanyId" }],
      get: {
        tags: ["Companies"],
        summary: "List company verification submissions",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Company verification submission history" },
          "401": { description: "Authentication is required" },
          "403": { description: "User is not a member of this company" },
        },
      },
      post: {
        tags: ["Companies"],
        summary: "Submit company verification documents",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SubmitVerificationRequest",
              },
            },
          },
        },
        responses: {
          "201": { description: "Verification documents submitted" },
          "400": { description: "Invalid verification submission" },
          "401": { description: "Authentication is required" },
          "403": { description: "Company administrator access is required" },
          "404": { description: "Company not found" },
        },
      },
    },
    "/api/v1/admin/verifications": {
      get: {
        tags: ["Administration"],
        summary: "List pending company verifications",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Pending verification requests" },
          "401": { description: "Authentication is required" },
          "403": { description: "Platform administrator access is required" },
        },
      },
    },
    "/api/v1/admin/verifications/{id}/decision": {
      parameters: [{ $ref: "#/components/parameters/VerificationId" }],
      post: {
        tags: ["Administration"],
        summary: "Approve or reject a company verification",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/VerificationDecisionRequest",
              },
            },
          },
        },
        responses: {
          "200": { description: "Verification decision recorded" },
          "400": { description: "Invalid decision" },
          "401": { description: "Authentication is required" },
          "403": { description: "Platform administrator access is required" },
          "404": { description: "Verification not found" },
          "409": { description: "Verification has already been decided" },
        },
      },
    },
    "/api/v1/internal/companies/{id}/access/{userId}": {
      parameters: [
        { $ref: "#/components/parameters/CompanyId" },
        {
          name: "userId",
          in: "path",
          required: true,
          schema: { type: "string", minLength: 1 },
        },
      ],
      get: {
        tags: ["Internal"],
        summary: "Get company access and membership for a user",
        security: [{ internalServiceKey: [] }],
        responses: {
          "200": {
            description: "Company status, membership, and access decision",
          },
          "401": { description: "Internal service key is missing or invalid" },
          "404": { description: "Company not found" },
        },
      },
    },
    "/api/v1/internal/companies/{id}/verification": {
      parameters: [{ $ref: "#/components/parameters/CompanyId" }],
      get: {
        tags: ["Internal"],
        summary: "Get company verification status",
        security: [{ internalServiceKey: [] }],
        responses: {
          "200": { description: "Company verification status" },
          "401": { description: "Internal service key is missing or invalid" },
          "404": { description: "Company not found" },
        },
      },
    },
    "/api/v1/talent/profile": {
      post: {
        tags: ["Talent Profiles"],
        summary: "Create or upsert the current user's talent profile",
        description:
          "Forwarded to profile-service. The profile completeness score is recalculated.",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TalentProfileInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Talent profile saved with completeness details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileWithCompletenessResponse" },
              },
            },
          },
          "400": { description: "Profile payload failed validation" },
          "401": { description: "Authentication is required" },
          "502": { description: "Profile service is unavailable" },
        },
      },
    },
    "/api/v1/talent/profile/me": {
      get: {
        tags: ["Talent Profiles"],
        summary: "Get the current user's talent profile",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": {
            description: "Talent profile and completeness details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileWithCompletenessResponse" },
              },
            },
          },
          "401": { description: "Authentication is required" },
          "404": {
            description: "Profile has not been created; includes completeness recommendations",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/NotFoundWithCompletenessResponse" },
              },
            },
          },
          "502": { description: "Profile service is unavailable" },
        },
      },
      patch: {
        tags: ["Talent Profiles"],
        summary: "Partially update the current user's talent profile",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateTalentProfileInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Talent profile updated with recalculated completeness",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProfileWithCompletenessResponse" },
              },
            },
          },
          "400": { description: "Profile payload failed validation" },
          "401": { description: "Authentication is required" },
          "502": { description: "Profile service is unavailable" },
        },
      },
    },
    "/api/v1/talent/profile/{id}": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          description: "Talent profile UUID",
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: {
        tags: ["Talent Profiles"],
        summary: "Get a public talent profile by ID",
        responses: {
          "200": {
            description: "Public talent profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SingleTalentProfileResponse" },
              },
            },
          },
          "404": { description: "Talent profile not found" },
          "502": { description: "Profile service is unavailable" },
        },
      },
    },
    "/api/v1/talent/profiles": {
      get: {
        tags: ["Talent Profiles"],
        summary: "Search the public talent directory",
        parameters: [
          {
            name: "skills",
            in: "query",
            description: "One skill or comma-separated skills",
            schema: { type: "string" },
          },
          { name: "country", in: "query", schema: { type: "string" } },
          { name: "availability", in: "query", schema: { type: "string" } },
          {
            name: "work_arrangement_pref",
            in: "query",
            schema: { type: "string", enum: ["remote", "hybrid", "onsite", "any"] },
          },
          {
            name: "min_completeness",
            in: "query",
            schema: { type: "integer", minimum: 0, maximum: 100 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: "offset",
            in: "query",
            schema: { type: "integer", minimum: 0, default: 0 },
          },
        ],
        responses: {
          "200": {
            description: "Matching talent profiles and pagination metadata",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TalentListResponse" },
              },
            },
          },
          "400": { description: "Invalid query parameters" },
          "502": { description: "Profile service is unavailable" },
        },
      },
    },
    "/api/v1/opportunities": {
      get: {
        tags: ["Opportunities"],
        summary: "Search and paginate opportunities",
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "page_size",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: "sort_by",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "created_at",
                "updated_at",
                "application_deadline",
                "start_date",
                "title",
              ],
              default: "created_at",
            },
          },
          {
            name: "sort_order",
            in: "query",
            schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
          },
          { name: "opportunity_type", in: "query", schema: { type: "string" } },
          { name: "employment_type", in: "query", schema: { type: "string" } },
          { name: "experience_level", in: "query", schema: { type: "string" } },
          { name: "work_arrangement", in: "query", schema: { type: "string" } },
          {
            name: "country",
            in: "query",
            schema: { type: "string", minLength: 2, maxLength: 2 },
          },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "is_paid", in: "query", schema: { type: "boolean" } },
          {
            name: "search",
            in: "query",
            schema: { type: "string", maxLength: 200 },
          },
          {
            name: "skills",
            in: "query",
            description:
              "Comma-separated skill names; all listed skills must match.",
            schema: { type: "string" },
          },
          {
            name: "company_id",
            in: "query",
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Page of opportunities and pagination metadata",
          },
          "400": { description: "Invalid query parameter" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
      post: {
        tags: ["Opportunities"],
        summary: "Create an opportunity",
        description:
          "A published opportunity may enqueue follower notifications when follower_recipients are included.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOpportunityRequest" },
            },
          },
        },
        responses: {
          "201": { description: "Opportunity created" },
          "400": { description: "Invalid opportunity" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
    },
    "/api/v1/opportunities/{id}": {
      parameters: [{ $ref: "#/components/parameters/OpportunityId" }],
      get: {
        tags: ["Opportunities"],
        summary: "Get an opportunity by ID",
        responses: {
          "200": { description: "Opportunity record" },
          "400": { description: "ID is not a UUID" },
          "404": { description: "Opportunity not found" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
    },
    "/api/v1/job/listing": {
      get: {
        tags: ["Opportunities"],
        summary: "Search and paginate opportunities",
        description:
          "Public route forwarded to joblisting-service. Published listings are returned by default; querying another status requires a session and active company-admin access.",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "sort_by", in: "query", schema: { type: "string", enum: ["created_at", "updated_at", "application_deadline", "start_date", "title"] } },
          { name: "sort_order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "opportunity_type", in: "query", schema: { type: "string" } },
          { name: "employment_type", in: "query", schema: { type: "string" } },
          { name: "experience_level", in: "query", schema: { type: "string" } },
          { name: "work_arrangement", in: "query", schema: { type: "string" } },
          { name: "country", in: "query", schema: { type: "string", minLength: 2, maxLength: 2 } },
          { name: "status", in: "query", schema: { type: "string", enum: ["draft", "published", "paused", "closed"] } },
          { name: "is_paid", in: "query", schema: { type: "boolean" } },
          { name: "search", in: "query", schema: { type: "string", maxLength: 200 } },
          { name: "skills", in: "query", description: "Comma-separated skill names; all listed skills must match.", schema: { type: "string" } },
          { name: "company_id", in: "query", description: "With scope=company, lists every status for this company (admin only). Alternatively send company_id in a JSON request body.", schema: { type: "string", format: "uuid" } },
          { name: "scope", in: "query", description: "Set to `company` to use company_id as the management listing.", schema: { type: "string", enum: ["company"] } },
        ],
        responses: {
          "200": { description: "Page of matching opportunity listings" },
          "400": { description: "Invalid query parameters" },
          "401": { description: "Authentication is required for unpublished statuses" },
          "403": { description: "Active company administrator access is required" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
      post: {
        tags: ["Opportunities"],
        summary: "Create an opportunity",
        description:
          "Requires a Better Auth session and active ADMIN membership in the supplied company. The backend derives company name and creator from trusted service data.",
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOpportunityRequest" },
            },
          },
        },
        responses: {
          "201": { description: "Opportunity created" },
          "400": { description: "Invalid opportunity payload" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access is required" },
          "503": { description: "Authentication or authorization service is unavailable" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
    },
    "/api/v1/job/listing/{id}": {
      parameters: [{ $ref: "#/components/parameters/OpportunityId" }],
      get: {
        tags: ["Opportunities"],
        summary: "Get an opportunity by ID",
        description:
          "Published opportunities are public. Any other status requires a session and active company-admin access.",
        responses: {
          "200": { description: "Opportunity record" },
          "400": { description: "ID is not a UUID" },
          "401": { description: "Authentication is required for unpublished opportunities" },
          "403": { description: "Active company administrator access is required" },
          "404": { description: "Opportunity not found" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
      put: {
        tags: ["Opportunities"],
        summary: "Update editable fields on an opportunity",
        security: [{ sessionCookie: [] }],
        description:
          "Requires a Better Auth session and active ADMIN membership in the opportunity's company.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OpportunityUpdateRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Opportunity updated" },
          "400": { description: "Invalid ID or update payload" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access is required" },
          "404": { description: "Opportunity not found" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
      patch: {
        tags: ["Opportunities"],
        summary: "Partially update an opportunity",
        security: [{ sessionCookie: [] }],
        description:
          "Requires a Better Auth session and active ADMIN membership in the opportunity's company.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OpportunityUpdateRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Opportunity updated" },
          "400": { description: "Invalid ID or update payload" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access is required" },
          "404": { description: "Opportunity not found" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
      delete: {
        tags: ["Opportunities"],
        summary: "Delete an opportunity",
        security: [{ sessionCookie: [] }],
        description:
          "Requires a Better Auth session and active ADMIN membership in the opportunity's company.",
        responses: {
          "204": { description: "Opportunity deleted" },
          "400": { description: "ID is not a UUID" },
          "401": { description: "Authentication is required" },
          "403": { description: "Active company administrator access is required" },
          "404": { description: "Opportunity not found" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
    },
    "/api/v1/opportunities/{id}/applications": {
      parameters: [{ $ref: "#/components/parameters/OpportunityId" }],
      post: {
        tags: ["Opportunities"],
        summary: "Queue an application email to the hiring contact",
        description:
          "This endpoint queues an email; applications are not persisted by this service.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ApplicationNotificationRequest",
              },
            },
          },
        },
        responses: {
          "202": { description: "Application notification accepted" },
          "400": { description: "Invalid application or opportunity ID" },
          "404": { description: "Opportunity not found" },
          "503": { description: "Notification could not be queued" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
    },
    "/api/v1/notifications/email": {
      post: {
        tags: ["Notifications"],
        summary: "Send an email notification",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EmailNotificationRequest" },
            },
          },
        },
        responses: {
          "202": { description: "Email accepted and notification saved" },
          "400": { description: "Request body failed validation" },
          "401": { description: "Notification API key is missing or invalid" },
          "500": {
            description:
              "Email was sent but the notification could not be saved",
          },
          "502": {
            description:
              "Notification service or email provider is unavailable",
          },
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
        description:
          "Session cookie returned by a successful Better Auth sign-in.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API key",
        description: "Use the configured NOTIFICATION_API_KEY.",
      },
      internalServiceKey: {
        type: "apiKey",
        in: "header",
        name: "x-internal-service-key",
        description: "Shared internal service secret.",
      },
    },
    parameters: {
      CompanyId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
      VerificationId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
      OpportunityId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" }, message: { type: "string" } },
      },
      EmailSignUpRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", minLength: 1 },
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          image: { type: "string", format: "uri" },
        },
      },
      EmailSignInRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
          rememberMe: { type: "boolean", default: true },
        },
      },
      SocialSignInRequest: {
        type: "object",
        required: ["provider"],
        properties: {
          provider: {
            type: "string",
            enum: ["google", "apple", "twitter", "linkedin"],
          },
          callbackURL: { type: "string", format: "uri" },
          errorCallbackURL: { type: "string", format: "uri" },
          newUserCallbackURL: { type: "string", format: "uri" },
          disableRedirect: { type: "boolean", default: false },
        },
      },
      CreateCompanyRequest: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 255 },
          website: { type: ["string", "null"], format: "uri", maxLength: 255 },
          country: { type: ["string", "null"], pattern: "^[A-Z]{2}$" },
          industry: { type: ["string", "null"], maxLength: 100 },
          registration_number: { type: ["string", "null"], maxLength: 100 },
          logo_url: { type: ["string", "null"], format: "uri", maxLength: 500 },
        },
      },
      UpdateCompanyRequest: {
        type: "object",
        description: "Any subset of the company creation properties.",
        properties: {
          name: { type: "string", minLength: 2, maxLength: 255 },
          website: { type: ["string", "null"], format: "uri", maxLength: 255 },
          country: { type: ["string", "null"], pattern: "^[A-Z]{2}$" },
          industry: { type: ["string", "null"], maxLength: 100 },
          registration_number: { type: ["string", "null"], maxLength: 100 },
          logo_url: { type: ["string", "null"], format: "uri", maxLength: 500 },
        },
      },
      InviteMemberRequest: {
        type: "object",
        required: ["user_id", "workspace_role"],
        properties: {
          user_id: { type: "string", minLength: 1 },
          workspace_role: { type: "string", enum: ["ADMIN", "MEMBER"] },
        },
      },
      SubmitVerificationRequest: {
        type: "object",
        required: ["documents"],
        properties: {
          registration_number: { type: "string", maxLength: 100 },
          documents: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: ["title", "url"],
              properties: {
                title: { type: "string", minLength: 2, maxLength: 255 },
                url: { type: "string", format: "uri", maxLength: 500 },
                document_type: { type: "string", maxLength: 100 },
                uploaded_at: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      VerificationDecisionRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["APPROVED", "REJECTED"] },
          review_notes: { type: ["string", "null"], maxLength: 2000 },
        },
      },
      TalentProfileInput: {
        type: "object",
        properties: {
          full_name: { type: ["string", "null"], maxLength: 255 },
          phone: { type: ["string", "null"], maxLength: 50 },
          country: { type: ["string", "null"], maxLength: 100 },
          location: { type: ["string", "null"], maxLength: 255 },
          headline: { type: ["string", "null"], maxLength: 255 },
          education: {
            type: "array",
            items: { $ref: "#/components/schemas/TalentEducationItem" },
          },
          experience: {
            type: "array",
            items: { $ref: "#/components/schemas/TalentExperienceItem" },
          },
          skills: { type: "array", items: { type: "string", minLength: 1 } },
          preferred_roles: {
            type: "array",
            items: { type: "string", minLength: 1 },
          },
          availability: { type: ["string", "null"], maxLength: 50 },
          work_arrangement_pref: {
            type: ["string", "null"],
            maxLength: 50,
          },
          career_goals: { type: ["string", "null"], maxLength: 5000 },
          cv_url: { type: ["string", "null"], maxLength: 1024 },
        },
      },
      UpdateTalentProfileInput: {
        allOf: [{ $ref: "#/components/schemas/TalentProfileInput" }],
        description: "Any subset of the talent profile properties.",
      },
      TalentEducationItem: {
        type: "object",
        required: ["institution", "degree"],
        properties: {
          institution: { type: "string", minLength: 1 },
          degree: { type: "string", minLength: 1 },
          field_of_study: { type: "string" },
          start_year: { type: "integer", minimum: 1950, maximum: 2100 },
          end_year: {
            type: ["integer", "null"],
            minimum: 1950,
            maximum: 2100,
          },
        },
      },
      TalentExperienceItem: {
        type: "object",
        required: ["company", "title"],
        properties: {
          company: { type: "string", minLength: 1 },
          title: { type: "string", minLength: 1 },
          location: { type: "string" },
          start_date: { type: "string" },
          end_date: { type: ["string", "null"] },
          current: { type: "boolean" },
          description: { type: "string" },
        },
      },
      TalentProfile: {
        allOf: [
          { $ref: "#/components/schemas/TalentProfileInput" },
          {
            type: "object",
            required: [
              "id",
              "user_id",
              "profile_completeness",
              "readiness_score",
              "created_at",
              "updated_at",
            ],
            properties: {
              id: { type: "string", format: "uuid" },
              user_id: { type: "string" },
              profile_completeness: { type: "integer", minimum: 0, maximum: 100 },
              readiness_score: { type: "integer" },
              created_at: { type: "string", format: "date-time" },
              updated_at: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      CompletenessCalculation: {
        type: "object",
        required: ["score", "missing_fields", "next_prompt", "breakdown"],
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100 },
          missing_fields: {
            type: "array",
            items: {
              type: "object",
              required: ["field", "label", "weight"],
              properties: {
                field: { type: "string" },
                label: { type: "string" },
                weight: { type: "integer" },
              },
            },
          },
          next_prompt: { type: ["string", "null"] },
          breakdown: {
            type: "object",
            properties: {
              basic_info: { type: "integer" },
              contact_location: { type: "integer" },
              skills: { type: "integer" },
              preferred_roles: { type: "integer" },
              education: { type: "integer" },
              experience: { type: "integer" },
              preferences_goals: { type: "integer" },
              cv_url: { type: "integer" },
            },
          },
        },
      },
      ProfileWithCompletenessResponse: {
        type: "object",
        required: ["success", "data"],
        properties: {
          success: { type: "boolean", const: true },
          data: {
            type: "object",
            required: ["profile", "completeness"],
            properties: {
              profile: { $ref: "#/components/schemas/TalentProfile" },
              completeness: { $ref: "#/components/schemas/CompletenessCalculation" },
            },
          },
        },
      },
      NotFoundWithCompletenessResponse: {
        type: "object",
        required: ["success", "error", "completeness"],
        properties: {
          success: { type: "boolean", const: false },
          error: { type: "string" },
          message: { type: "string" },
          completeness: { $ref: "#/components/schemas/CompletenessCalculation" },
        },
      },
      SingleTalentProfileResponse: {
        type: "object",
        required: ["success", "data"],
        properties: {
          success: { type: "boolean", const: true },
          data: {
            type: "object",
            required: ["profile"],
            properties: {
              profile: { $ref: "#/components/schemas/TalentProfile" },
            },
          },
        },
      },
      TalentListResponse: {
        type: "object",
        required: ["success", "data", "pagination"],
        properties: {
          success: { type: "boolean", const: true },
          data: {
            type: "array",
            items: { $ref: "#/components/schemas/TalentProfile" },
          },
          pagination: {
            type: "object",
            required: ["total", "limit", "offset"],
            properties: {
              total: { type: "integer" },
              limit: { type: "integer" },
              offset: { type: "integer" },
            },
          },
        },
      },
      CreateOpportunityRequest: {
        type: "object",
        required: [
          "company_id",
          "title",
          "description",
          "opportunity_type",
          "is_paid",
          "work_arrangement",
        ],
        additionalProperties: false,
        properties: {
          company_id: { type: "string", format: "uuid" },
          source_type: { type: "string", default: "employer" },
          external_apply_url: { type: ["string", "null"], format: "uri" },
          title: { type: "string" },
          description: { type: "string" },
          responsibilities: { type: ["string", "null"] },
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
          application_deadline: {
            type: ["string", "null"],
            format: "date-time",
          },
          openings: { type: ["integer", "null"] },
          status: {
            type: "string",
            enum: ["draft", "published", "paused", "closed"],
          },
          follower_recipients: {
            type: "array",
            description:
              "Temporary trusted-caller input for company followers.",
            items: {
              type: "object",
              required: ["email"],
              properties: {
                email: { type: "string", format: "email" },
                name: { type: "string", maxLength: 120 },
              },
            },
          },
          OpportunityUpdateRequest: {
            type: "object",
            minProperties: 1,
            additionalProperties: false,
            properties: {
              external_apply_url: { type: ["string", "null"], format: "uri" },
              title: { type: "string", minLength: 1, maxLength: 500 },
              description: { type: "string", minLength: 1, maxLength: 50000 },
              responsibilities: { type: ["string", "null"], maxLength: 50000 },
              opportunity_type: { type: "string", minLength: 1, maxLength: 100 },
              employment_type: { type: ["string", "null"], maxLength: 100 },
              experience_level: { type: ["string", "null"], maxLength: 100 },
              is_paid: { type: "boolean" },
              compensation_min: { type: ["number", "null"], minimum: 0 },
              compensation_max: { type: ["number", "null"], minimum: 0 },
              currency: { type: ["string", "null"], pattern: "^[A-Za-z]{3}$" },
              payment_frequency: { type: ["string", "null"], maxLength: 100 },
              country: { type: ["string", "null"], pattern: "^[A-Za-z]{2}$" },
              location: { type: ["string", "null"], maxLength: 255 },
              work_arrangement: { type: "string", minLength: 1, maxLength: 100 },
              skills_required: {
                type: "array",
                maxItems: 100,
                items: { type: "string", minLength: 1, maxLength: 100 },
              },
              duration_weeks: { type: ["integer", "null"], minimum: 1, maximum: 520 },
              start_date: { type: ["string", "null"], format: "date" },
              application_deadline: { type: ["string", "null"], format: "date-time" },
              openings: { type: ["integer", "null"], minimum: 1, maximum: 1000000 },
              status: { type: "string", enum: ["draft", "published", "paused", "closed"] },
            },
          },
        },
      },
      ApplicationNotificationRequest: {
        type: "object",
        required: ["applicant_name", "applicant_email", "company_email"],
        properties: {
          applicant_name: { type: "string", minLength: 1, maxLength: 120 },
          applicant_email: { type: "string", format: "email" },
          company_email: { type: "string", format: "email" },
          company_contact_name: { type: "string", maxLength: 120 },
        },
      },
      EmailNotificationRequest: {
        type: "object",
        required: ["type", "user_id", "to", "subject", "message"],
        properties: {
          type: {
            type: "string",
            enum: [
              "account",
              "application",
              "interview",
              "offer",
              "message",
              "system",
            ],
          },
          user_id: { type: "string", minLength: 1 },
          to: { type: "string", format: "email" },
          recipientName: { type: "string", minLength: 1, maxLength: 120 },
          subject: { type: "string", minLength: 1, maxLength: 200 },
          message: { type: "string", minLength: 1, maxLength: 10000 },
          action: {
            type: "object",
            required: ["label", "url"],
            properties: {
              label: { type: "string", minLength: 1, maxLength: 80 },
              url: { type: "string", format: "uri" },
            },
          },
        },
      },
    },
  },
} as const;
