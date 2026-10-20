const opportunityProperties = {
  id: { type: "string", format: "uuid", readOnly: true },
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
  application_deadline: { type: ["string", "null"], format: "date-time" },
  openings: { type: ["integer", "null"] },
  status: { type: "string" },
  views_count: { type: "integer", readOnly: true },
  last_synced_at: { type: ["string", "null"], format: "date-time" },
  expires_at: { type: ["string", "null"], format: "date-time" },
  created_by: { type: ["string", "null"], format: "uuid" },
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
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "is_paid", in: "query", schema: { type: "boolean" } },
          { name: "search", in: "query", schema: { type: "string", maxLength: 200 } },
          { name: "skills", in: "query", description: "Comma-separated skill names; all listed skills must match.", schema: { type: "string" } },
          { name: "company_id", in: "query", schema: { type: "string", format: "uuid" } },
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
          "500": { description: "The opportunity search failed" },
        },
      },
      post: {
        tags: ["Opportunities"],
        summary: "Create an opportunity",
        description:
          "When status is `published` and follower_recipients are included, queues a `job.published` event for notification-service. follower_recipients is a temporary integration input until company follower data is connected.",
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
          schema: { type: "string", format: "uuid" },
        },
      ],
      get: {
        tags: ["Opportunities"],
        summary: "Get an opportunity by ID",
        responses: {
          "200": {
            description: "Opportunity record",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OpportunityResponse" },
              },
            },
          },
          "400": { description: "ID is not a UUID" },
          "404": { description: "Opportunity not found" },
          "500": { description: "The opportunity lookup failed" },
        },
      },
    },
    "/opportunities/{id}/applications": {
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
      ],
      post: {
        tags: ["Applications"],
        summary: "Queue an application email to the hiring contact",
        description:
          "This endpoint only queues the notification; applications are not persisted by this service. company_email is a temporary input until company records can resolve the hiring contact.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApplicationNotificationRequest" },
            },
          },
        },
        responses: {
          "202": {
            description: "Application notification accepted by RabbitMQ",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApplicationNotificationResponse" },
              },
            },
          },
          "400": { description: "Invalid application or opportunity ID" },
          "404": { description: "Opportunity not found" },
          "503": { description: "Notification could not be queued" },
        },
      },
    },
  },
  components: {
    schemas: {
      Opportunity: {
        type: "object",
        required: opportunityRequired,
        properties: opportunityProperties,
      },
      CreateOpportunityRequest: {
        type: "object",
        required: opportunityRequired,
        properties: {
          ...opportunityProperties,
          follower_recipients: {
            type: "array",
            description: "Temporary trusted-caller input for company followers.",
            items: { $ref: "#/components/schemas/NotificationRecipient" },
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
