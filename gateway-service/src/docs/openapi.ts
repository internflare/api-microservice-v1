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
          "Forwarded unchanged to Better Auth. A welcome-email event is published after successful account creation.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EmailSignUpRequest" },
            },
          },
        },
        responses: {
          "200": { description: "Account created and session returned" },
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
        description: "Forwarded unchanged to Better Auth.",
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
          "401": { description: "Invalid email or password" },
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
    "/api/v1/auth/employer-onboarding": {
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
    "/api/v1/auth/{id}": {
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
    "/api/v1/auth/{id}/members": {
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
    "/api/v1/auth/{id}/members/invite": {
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
    "/api/v1/auth/{id}/members/accept": {
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
    "/api/v1/auth/{id}/members/{memberId}": {
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
    "/api/v1/auth/{id}/verifications": {
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
      CreateOpportunityRequest: {
        type: "object",
        required: [
          "source_type",
          "title",
          "description",
          "opportunity_type",
          "is_paid",
          "work_arrangement",
        ],
        properties: {
          company_id: { type: ["string", "null"], format: "uuid" },
          external_company_name: { type: ["string", "null"] },
          source_type: { type: "string" },
          external_id: { type: ["string", "null"] },
          source_url: { type: ["string", "null"], format: "uri" },
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
          status: { type: "string" },
          created_by: { type: ["string", "null"], format: "uuid" },
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
