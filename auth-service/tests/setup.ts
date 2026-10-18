import process from "node:process";

// Test environment setup: supplies mock environment variables for isolated unit & integration tests

// 1. Core Service Environment
process.env.NODE_ENV = "test";
process.env.PORT = process.env.PORT || "3001";
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || "http://localhost:5173";

// 2. Database & Better Auth
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/internflare_test";
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET || "a-random-secret-that-is-at-least-32-characters-long";
process.env.BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL || "http://localhost:3001";

// 3. OAuth Identity Providers (Mock Credentials)
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "mock-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "mock-google-client-secret";
process.env.APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "mock-apple-client-id";
process.env.APPLE_CLIENT_SECRET = process.env.APPLE_CLIENT_SECRET || "mock-apple-client-secret";
process.env.X_CLIENT_ID = process.env.X_CLIENT_ID || "mock-x-client-id";
process.env.X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || "mock-x-client-secret";
process.env.LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "mock-linkedin-client-id";
process.env.LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "mock-linkedin-client-secret";

// 4. Internal Microservice & Messaging
process.env.INTERNAL_SERVICE_SECRET =
  process.env.INTERNAL_SERVICE_SECRET || "mock-internal-service-secret-at-least-32-chars";
process.env.RABBITMQ_URL =
  process.env.RABBITMQ_URL || "amqp://localhost:5672";

// 5. Telemetry & Monitoring (Explicitly Disabled for Tests)
process.env.SENTRY_DSN = "";
process.env.SENTRY_TRACES_SAMPLE_RATE = "0";

// 6. Suppress mock database schema ping noise during tests
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const firstArg = args[0];
  const message =
    typeof firstArg === "string"
      ? firstArg
      : firstArg instanceof Error
      ? firstArg.message
      : "";
  if (message.includes("[Better Auth]: Could not validate the database schema")) {
    return;
  }
  originalConsoleError(...args);
};
