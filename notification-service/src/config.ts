import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const mongodbUri = requireEnv("MONGODB_URI");
const mongodbDbName = process.env.MONGODB_DB_NAME?.trim() || undefined;
const resendApiKey = requireEnv("RESEND_API_KEY");
const nodeEnv = requireEnv("NODE_ENV");

const port = Number.parseInt(process.env.PORT ?? "3002", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const apiKey = requireEnv("NOTIFICATION_API_KEY");
if (apiKey.length < 32) {
  throw new Error("NOTIFICATION_API_KEY must be at least 32 characters long");
}

function parseSampleRate(value: string | undefined): number {
  if (!value?.trim()) return 0.1;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error("SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1");
  }
  return rate;
}

const emailFrom = requireEnv("EMAIL_FROM");
if (
  !/^[^<>]+<[^<>@\s]+@[^<>@\s]+>$/.test(emailFrom) &&
  !/^[^<>\s@]+@[^<>\s@]+$/.test(emailFrom)
) {
  throw new Error(
    "EMAIL_FROM must be an email address or a named email address",
  );
}

const rabbitmqUrl = process.env.RABBITMQ_URL?.trim() || "amqp://localhost:5672";
if (!["amqp:", "amqps:"].includes(new URL(rabbitmqUrl).protocol)) {
  throw new Error("RABBITMQ_URL must use the amqp:// or amqps:// protocol");
}

const frontendUrl = process.env.FRONTEND_URL?.trim() || "http://localhost:5173";
if (!["http:", "https:"].includes(new URL(frontendUrl).protocol)) {
  throw new Error("FRONTEND_URL must use the http:// or https:// protocol");
}

const config = {
  nodeEnv,
  port,
  mongodbUri,
  mongodbDbName,
  resendApiKey,
  emailFrom,
  apiKey,
  rabbitmqUrl,
  notificationQueue: "internflare.notifications",
  frontendUrl,
  sentryDsn: process.env.SENTRY_DSN?.trim() || undefined,
  sentryTracesSampleRate: parseSampleRate(
    process.env.SENTRY_TRACES_SAMPLE_RATE,
  ),
};

export { config };
