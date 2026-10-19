import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const port = Number.parseInt(process.env.PORT ?? "3005", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  (nodeEnv === "test"
    ? "postgresql://postgres:postgres@localhost:5432/internflare_test"
    : requireEnv("DATABASE_URL"));

const authServiceUrl =
  process.env.AUTH_SERVICE_URL?.trim() || "http://localhost:3001";

const internalServiceSecret =
  process.env.INTERNAL_SERVICE_SECRET?.trim() ||
  (nodeEnv === "production"
    ? requireEnv("INTERNAL_SERVICE_SECRET")
    : "internflare-internal-microservice-secret-key-32chars");

const trustedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  nodeEnv,
  port,
  databaseUrl,
  authServiceUrl,
  internalServiceSecret,
  databaseSsl: process.env.DATABASE_SSL === "true",
  trustedOrigins,
  isProduction: nodeEnv === "production",
};
