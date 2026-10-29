// Test environment setup for isolated unit tests.
process.env.NODE_ENV = "test";
process.env.PORT = process.env.PORT || "3003";
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || "http://localhost:5173";
process.env.R2_PUBLIC_URL = "";
process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/internflare_test";
process.env.AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3001";
process.env.INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || "mock-internal-service-secret-at-least-32-chars";
