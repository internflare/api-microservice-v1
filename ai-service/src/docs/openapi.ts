// OpenAPI description of the ai-service endpoints (also merged into the gateway docs).
export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Internflare AI Service",
    version: "1.0.0",
    description:
      "Talent assessments: questions are drawn from a reusable bank (seeded and OpenAI-generated), graded with OpenAI, and the result is emailed.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/health": { get: { summary: "Health check", responses: { "200": { description: "Healthy" } } } },
    "/ai/assessments/suggestion": {
      get: {
        summary: "Suggested role and level from the talent profile",
        responses: { "200": { description: "Suggestion" }, "409": { description: "Onboarding incomplete" } },
      },
    },
    "/ai/assessments": {
      get: { summary: "List completed assessments", responses: { "200": { description: "Assessments" } } },
      post: {
        summary: "Start an assessment",
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
        responses: { "201": { description: "Attempt with questions" }, "429": { description: "Daily limit reached" } },
      },
    },
    "/ai/assessments/{id}/submit": {
      post: {
        summary: "Submit answers and metrics; returns scores and placement (learning, internship or job)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
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
                    description: "Map of question id to {choice?, text?, code?}",
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
        responses: { "200": { description: "Graded result" }, "409": { description: "Already submitted" } },
      },
    },
    "/ai/listings/description": {
      post: {
        summary: "Draft a job or internship description from the listing details",
        description:
          "Requires a signed-in user. Limited to 10 requests per minute. Only `title` is required; every other field sharpens the draft.",
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
          "200": {
            description: "Generated description",
            content: {
              "application/json": {
                schema: { type: "object", properties: { description: { type: "string" } } },
              },
            },
          },
          "400": { description: "Invalid input" },
          "401": { description: "Authentication is required" },
          "429": { description: "Rate limit reached" },
          "502": { description: "AI provider failed" },
        },
      },
    },
    "/ai/assessments/{id}": {
      get: {
        summary: "Get one assessment",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Assessment" }, "404": { description: "Not found" } },
      },
    },
  },
};
