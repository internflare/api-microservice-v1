export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Internflare API Gateway",
    version: "1.0.0",
    description:
      "Public entry point for the Internflare backend. The gateway preserves API paths and forwards each request to its owning service. Use each service's OpenAPI document for complete endpoint details.",
  },
  servers: [{ url: "/", description: "Current gateway origin" }],
  tags: [
    { name: "Gateway", description: "Gateway health and routing" },
    { name: "Authentication", description: "Forwarded to auth-service" },
    { name: "Opportunities", description: "Forwarded to jobListing-service" },
    { name: "Notifications", description: "Forwarded to notification-service" },
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
    "/api/auth/sign-in/email": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in with email and password",
        description: "Forwarded without path rewriting to auth-service.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Sign-in succeeded; session cookie is returned" },
          "401": { description: "Invalid credentials" },
          "502": { description: "Auth service is unavailable" },
        },
      },
    },
    "/api/v1/opportunities": {
      get: {
        tags: ["Opportunities"],
        summary: "List opportunities",
        description:
          "Forwarded to jobListing-service. See its OpenAPI document for all query filters, pagination, and sorting options.",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "page_size", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "sort_by", in: "query", schema: { type: "string", enum: ["created_at", "updated_at", "application_deadline", "start_date", "title"] } },
          { name: "sort_order", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
          { name: "opportunity_type", in: "query", schema: { type: "string" } },
          { name: "employment_type", in: "query", schema: { type: "string" } },
          { name: "work_arrangement", in: "query", schema: { type: "string" } },
          { name: "country", in: "query", schema: { type: "string", minLength: 2, maxLength: 2 } },
          { name: "is_paid", in: "query", schema: { type: "boolean" } },
          { name: "search", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Paginated opportunity results" },
          "400": { description: "Invalid query parameters" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
      post: {
        tags: ["Opportunities"],
        summary: "Create an opportunity",
        description: "Forwarded to jobListing-service.",
        responses: {
          "201": { description: "Opportunity created" },
          "400": { description: "Invalid opportunity" },
          "502": { description: "Job listing service is unavailable" },
        },
      },
    },
    "/api/v1/notifications/email": {
      post: {
        tags: ["Notifications"],
        summary: "Send an email notification",
        description:
          "Forwarded to notification-service. Supply its configured bearer API key in the Authorization header.",
        security: [{ bearerAuth: [] }],
        responses: {
          "202": { description: "Email accepted for delivery" },
          "401": { description: "Notification API key is missing or invalid" },
          "502": { description: "Notification service is unavailable" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API key",
      },
    },
  },
} as const;
