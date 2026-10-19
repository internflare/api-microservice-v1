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
    "/api/v1/health": {
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
    "/api/v1/me": {
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
          "Better Auth creates the account. A welcome-email event is published to the shared RabbitMQ notification queue after successful account creation.",
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
        },
      },
    },
    "/api/auth/sign-in/email": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in with email and password",
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
          "401": { description: "Invalid email or password" },
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
          "401": { description: "No valid session was provided" },
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
