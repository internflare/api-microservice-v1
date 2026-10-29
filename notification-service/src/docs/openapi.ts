export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Internflare Notification Service",
    version: "1.0.0",
    description:
      "Backend email notification delivery API. Notification delivery records are stored in MongoDB. Signup and job-listing events published by backend services are consumed from the shared durable RabbitMQ queue `internflare.notifications` and routed by eventType. In-app delivery is not included yet.",
  },
  servers: [{ url: "/", description: "Current notification-service origin" }],
  tags: [
    { name: "Health", description: "Service health" },
    { name: "Email notifications", description: "Transactional email delivery" },
  ],
  paths: {
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
              "503": {
                description: "The notification database is unavailable",
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/UnavailableResponse" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/notifications/email": {
      post: {
        tags: ["Email notifications"],
        summary: "Send an email notification",
        description:
          "Accepts typed notification metadata and plain text content. The service renders safe HTML and text email alternatives before sending through Resend.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/EmailNotificationRequest" },
              example: {
                type: "application",
                user_id: "user_123",
                to: "candidate@example.com",
                recipientName: "Jordan",
                subject: "We received your application",
                message:
                  "Your application for the Product Design Intern role has been received.",
                action: {
                  label: "View application",
                  url: "https://app.example.com/app/applications",
                },
              },
            },
          },
        },
        responses: {
          "202": {
            description:
              "Email accepted by Resend and notification saved in MongoDB",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AcceptedResponse" },
              },
            },
          },
          "400": {
            description: "Request body failed validation",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationError" },
              },
            },
          },
          "401": {
            description: "Bearer API key is missing or invalid",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "502": {
            description: "Resend could not send the email",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "500": {
            description:
              "Email was sent but the notification could not be saved",
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
        bearerFormat: "API key",
        description: "Use the configured NOTIFICATION_API_KEY.",
      },
    },
    schemas: {
      NotificationType: {
        type: "string",
        enum: ["account", "application", "interview", "offer", "message", "system"],
        description: "Category used as the email label.",
      },
      UserSignedUpEvent: {
        type: "object",
        description:
          "RabbitMQ message published by auth-service after Better Auth successfully creates a user. It is consumed by this service and delivered as a welcome email.",
        required: ["eventId", "eventType", "occurredAt", "user"],
        properties: {
          eventId: { type: "string", format: "uuid" },
          eventType: { type: "string", const: "user.signed_up" },
          occurredAt: { type: "string", format: "date-time" },
          user: {
            type: "object",
            required: ["id", "name", "email", "createdAt"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              email: { type: "string", format: "email" },
              createdAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
      EmailVerificationRequestedEvent: {
        type: "object",
        description:
          "RabbitMQ message published by auth-service when a user signs up or attempts to sign in without a verified email. Notification-service sends a verification email with a button linking to Better Auth's one-time verification URL.",
        required: [
          "eventId",
          "eventType",
          "occurredAt",
          "user",
          "verificationUrl",
        ],
        properties: {
          eventId: { type: "string", format: "uuid" },
          eventType: {
            type: "string",
            const: "user.email_verification_requested",
          },
          occurredAt: { type: "string", format: "date-time" },
          user: {
            type: "object",
            required: ["id", "name", "email", "createdAt"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              email: { type: "string", format: "email" },
              createdAt: { type: "string", format: "date-time" },
            },
          },
          verificationUrl: {
            type: "string",
            format: "uri",
            description:
              "One-time Better Auth verification URL. Transport and storage must remain restricted to trusted backend services.",
          },
        },
      },
      JobPublishedEvent: {
        type: "object",
        description:
          "JobListing-service event consumed from the shared `internflare.notifications` queue to email company followers.",
        required: ["eventId", "eventType", "occurredAt", "opportunity", "recipients"],
        properties: {
          eventId: { type: "string", format: "uuid" },
          eventType: { type: "string", const: "job.published" },
          occurredAt: { type: "string", format: "date-time" },
          opportunity: {
            type: "object",
            required: [
              "id",
              "company_id",
              "title",
              "description",
              "location",
              "work_arrangement",
              "application_deadline",
            ],
            properties: {
              id: { type: "string", description: "MongoDB ObjectId" },
              company_id: { type: ["string", "null"], description: "MongoDB ObjectId" },
              title: { type: "string" },
              description: { type: "string" },
              location: { type: ["string", "null"] },
              work_arrangement: { type: "string" },
              application_deadline: {
                type: ["string", "null"],
                format: "date-time",
              },
            },
          },
          recipients: {
            type: "array",
            items: { $ref: "#/components/schemas/NotificationRecipient" },
          },
        },
      },
      JobApplicationSubmittedEvent: {
        type: "object",
        description:
          "JobListing-service event consumed from the shared notification queue to email the hiring contact.",
        required: ["eventId", "eventType", "occurredAt", "application", "recipient"],
        properties: {
          eventId: { type: "string", format: "uuid" },
          eventType: { type: "string", const: "job.application_submitted" },
          occurredAt: { type: "string", format: "date-time" },
          application: {
            type: "object",
            required: [
              "opportunityId",
              "opportunityTitle",
              "applicantName",
              "applicantEmail",
            ],
            properties: {
              opportunityId: { type: "string", description: "MongoDB ObjectId" },
              opportunityTitle: { type: "string" },
              applicantName: { type: "string" },
              applicantEmail: { type: "string", format: "email" },
            },
          },
          recipient: { $ref: "#/components/schemas/NotificationRecipient" },
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
      EmailAction: {
        type: "object",
        additionalProperties: false,
        required: ["label", "url"],
        properties: {
          label: { type: "string", minLength: 1, maxLength: 80 },
          url: {
            type: "string",
            format: "uri",
            description: "Must use HTTP or HTTPS.",
          },
        },
      },
      EmailNotificationRequest: {
        type: "object",
        additionalProperties: false,
        required: ["type", "user_id", "to", "subject", "message"],
        properties: {
          type: { $ref: "#/components/schemas/NotificationType" },
          user_id: {
            type: "string",
            minLength: 1,
            description: "Better Auth user ID associated with the notification.",
          },
          to: { type: "string", format: "email" },
          recipientName: { type: "string", minLength: 1, maxLength: 120 },
          subject: { type: "string", minLength: 1, maxLength: 200 },
          message: { type: "string", minLength: 1, maxLength: 10000 },
          action: { $ref: "#/components/schemas/EmailAction" },
        },
      },
      AcceptedResponse: {
        type: "object",
        required: ["status", "email_id", "notification"],
        properties: {
          status: { type: "string", const: "accepted" },
          email_id: { type: "string", description: "Resend email ID." },
          notification: { $ref: "#/components/schemas/NotificationRecord" },
        },
      },
      NotificationRecord: {
        type: "object",
        description: "Persisted notification record.",
        required: [
          "id",
          "user_id",
          "type",
          "title",
          "body",
          "link",
          "channel",
          "read_at",
          "created_at",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          user_id: { type: "string" },
          type: { $ref: "#/components/schemas/NotificationType" },
          title: { type: "string" },
          body: { type: "string" },
          link: { type: ["string", "null"], format: "uri" },
          channel: { type: "string", enum: ["email", "in_app"] },
          read_at: { type: ["string", "null"], format: "date-time" },
          created_at: { type: "string", format: "date-time" },
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
