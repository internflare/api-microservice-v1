export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Internflare Auth Service",
    version: "1.0.0",
    description:
      "Authentication, session, and health endpoints. Authentication endpoints are provided by Better Auth.",
  },
  servers: [{ url: "/", description: "Current auth-service origin" }],
  tags: [
    { name: "Authentication", description: "Better Auth authentication endpoints" },
    { name: "Sessions", description: "Current user session" },
    { name: "Health", description: "Service health" },
  ],
  paths: {
    "/invites/{token}": {
      get: {
        summary: "Look up a team invitation (public)",
        parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Company name, invited email and role" },
          "404": { description: "Invalid link" },
          "410": { description: "Expired, revoked or already used" },
        },
      },
    },
    "/invites/signup": {
      post: {
        summary: "Create an invited teammate's account (name and password only)",
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
          "201": { description: "Account created and linked to the company" },
          "400": { description: "Validation error" },
          "409": { description: "Account already exists" },
          "410": { description: "Invitation no longer valid" },
        },
      },
    },
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Check service health",
        responses: {
          "200": {
            description: "Service and database are healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
          "503": {
            description: "Database is unavailable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UnavailableResponse" },
              },
            },
          },
        },
      },
    },
    "/me": {
      get: {
        tags: ["Sessions"],
        summary: "Get the current user and session",
        description:
          "Requires the session cookie returned by a successful sign-in.",
        responses: {
          "200": {
            description: "Current session",
            content: {
              "application/json": {
                schema: { type: "object", description: "Better Auth session and user." },
              },
            },
          },
          "401": {
            description: "No valid session cookie was provided",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/api/auth/sign-up/email": {
      post: {
        tags: ["Authentication"],
        summary: "Create an account with email and password",
        description:
          "Better Auth creates the account and sends a verification email with a button link through the shared RabbitMQ notification queue. Email/password users cannot sign in until their email is verified.",
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
        },
      },
    },
    "/api/auth/sign-in/email": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in with email and password",
        description: "Email/password accounts must verify their email address before a session can be created.",
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
            description: "Sign-in succeeded; session is set in a response cookie",
          },
          "401": { description: "Invalid email or password, or email verification is required" },
          "429": { description: "Too many requests" },
        },
      },
    },
    "/api/auth/sign-out": {
      post: {
        tags: ["Authentication"],
        summary: "Sign out the current session",
        description: "Pass the session cookie to invalidate the session.",
        responses: {
          "200": { description: "Session signed out" },
          "401": { description: "No valid session was provided"           },
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
        },
      },
    },
    "/api/auth/get-session": {
      get: {
        tags: ["Authentication"],
        summary: "Get the Better Auth session",
        description: "Pass the session cookie to retrieve the current session.",
        responses: {
          "200": { description: "Current session, or null when signed out" },
          "401": { description: "Session is not valid" },
        },
      },
    },
  },
  components: {
    schemas: {
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
      HealthResponse: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", const: "ok" } },
      },
      UnavailableResponse: {
        type: "object",
        required: ["status"],
        properties: { status: { type: "string", const: "unavailable" } },
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
    },
  },
} as const;
