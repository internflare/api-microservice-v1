import "dotenv/config";

// Helper function to require environment variables and throw an error if they are missing.
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseSampleRate(value: string | undefined): number {
  if (!value?.trim()) return 0.1;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error("SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1");
  }
  return rate;
}

//get variables
const googleClientId = requireEnv("GOOGLE_CLIENT_ID");
const googleClientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
const appleClientId = requireEnv("APPLE_CLIENT_ID");
const appleClientSecret = requireEnv("APPLE_CLIENT_SECRET");
const xClientId = requireEnv("X_CLIENT_ID");
const xClientSecret = requireEnv("X_CLIENT_SECRET");
const linkedinClientId = requireEnv("LINKEDIN_CLIENT_ID");
const linkedinClientSecret = requireEnv("LINKEDIN_CLIENT_SECRET");
const databaseUrl = requireEnv("DATABASE_URL");
const nodeEnv = requireEnv("NODE_ENV");

// Validate configuration during startup rather than failing later on incoming requests.
const port = Number.parseInt(process.env.PORT ?? "3001", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

//check if the auth secret is at least 32 characters long
const authSecret = requireEnv("BETTER_AUTH_SECRET");
if (authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long");
}

// Validate the auth URL
const authUrl = process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3001";
if (!authUrl.startsWith("http://") && !authUrl.startsWith("https://")) {
  throw new Error("BETTER_AUTH_URL must be a valid HTTP or HTTPS URL");
}

// Validate the CORS origins
const trustedOrigins = new Set([
  authUrl,
  ...(process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

const rabbitmqUrl = process.env.RABBITMQ_URL?.trim() || "amqp://localhost:5672";
if (!["amqp:", "amqps:"].includes(new URL(rabbitmqUrl).protocol)) {
  throw new Error("RABBITMQ_URL must use the amqp:// or amqps:// protocol");
}

const config = {
  nodeEnv,
  port,
  databaseUrl,
  googleClientId,
  googleClientSecret,
  appleClientId,
  appleClientSecret,
  xClientId,
  xClientSecret,
  linkedinClientId,
  linkedinClientSecret,
  authSecret,
  authUrl,
  rabbitmqUrl,
  notificationQueue: "internflare.notifications",
  sentryDsn: process.env.SENTRY_DSN?.trim() || undefined,
  sentryTracesSampleRate: parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
  ),
  trustedOrigins: [...trustedOrigins],
};

//check if in production
const isProduction = nodeEnv === "production";

export { config, isProduction };
