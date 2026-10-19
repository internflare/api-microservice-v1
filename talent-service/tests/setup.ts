import process from "node:process";

// Test environment setup: supplies mock environment variables for isolated unit & integration tests

// 1. Core Service Environment
process.env.NODE_ENV = "test";
process.env.PORT = process.env.PORT || "3005";
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || "http://localhost:5173";

// 2. Database Persistence
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/internflare_test";

// 3. Authentication & Internal Microservice Secrets
process.env.AUTH_SERVICE_URL =
  process.env.AUTH_SERVICE_URL || "http://localhost:3001";
process.env.INTERNAL_SERVICE_SECRET =
  process.env.INTERNAL_SERVICE_SECRET || "mock-internal-service-secret-at-least-32-chars";
