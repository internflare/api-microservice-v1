import "dotenv/config";

// Read a required variable or fail fast at startup.
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Read a positive integer variable with a default.
function intEnv(name: string, fallback: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

// Read an http(s) origin variable.
function urlEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!["http:", "https:"].includes(new URL(value).protocol)) {
    throw new Error(`${name} must use the http:// or https:// protocol`);
  }
  return value.replace(/\/$/, "");
}

const rabbitmqUrl = process.env.RABBITMQ_URL?.trim() || "amqp://localhost:5672";
if (!["amqp:", "amqps:"].includes(new URL(rabbitmqUrl).protocol)) {
  throw new Error("RABBITMQ_URL must use the amqp:// or amqps:// protocol");
}

const config = {
  nodeEnv: requireEnv("NODE_ENV"),
  port: intEnv("PORT", 3005, 65535),
  mongodbUri: requireEnv("MONGODB_URI"),
  mongodbDbName: process.env.MONGODB_DB_NAME?.trim() || undefined,
  rabbitmqUrl,
  notificationQueue: "internflare.notifications",
  authServiceUrl: urlEnv("AUTH_SERVICE_URL", "http://localhost:3001"),
  profileServiceUrl: urlEnv("PROFILE_SERVICE_URL", "http://localhost:3004"),
  frontendUrl: urlEnv("FRONTEND_URL", "http://localhost:5173"),
  openaiApiKey: requireEnv("OPENAI_API_KEY"),
  openaiModel: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
  maxAttemptsPerDay: intEnv("MAX_ATTEMPTS_PER_DAY", 5, 100),
};

export { config };
