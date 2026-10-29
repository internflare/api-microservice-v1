import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const port = Number.parseInt(process.env.PORT ?? "3004", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const mongodbUri =
  process.env.MONGODB_URI?.trim() ||
  (nodeEnv === "test" ? "mongodb://127.0.0.1:27017/internflare_test" : requireEnv("MONGODB_URI"));
const mongodbDbName = process.env.MONGODB_DB_NAME?.trim() || undefined;
const authServiceUrl = process.env.AUTH_SERVICE_URL?.trim() || "http://localhost:3001";
const internalServiceSecret =
  process.env.INTERNAL_SERVICE_SECRET?.trim() ||
  (nodeEnv === "production"
    ? requireEnv("INTERNAL_SERVICE_SECRET")
    : "internflare-internal-microservice-secret-key-32chars");
const trustedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:3000")
  .split(",").map((origin) => origin.trim()).filter(Boolean);
const rabbitmqUrl = process.env.RABBITMQ_URL?.trim() || "amqp://localhost:5672";
const redisUrl = process.env.REDIS_URL?.trim() || "redis://localhost:6379";
if (!["amqp:", "amqps:"].includes(new URL(rabbitmqUrl).protocol)) {
  throw new Error("RABBITMQ_URL must use the amqp:// or amqps:// protocol");
}

// Cloudflare R2 (S3-compatible). Uploads answer 503 until all of these are set.
const r2 = {
  accountId: process.env.R2_ACCOUNT_ID?.trim() ?? "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
  bucket: process.env.R2_BUCKET?.trim() ?? "",
  publicUrl: (process.env.R2_PUBLIC_URL?.trim() ?? "").replace(/\/+$/, ""),
};

export const config = {
  r2,
  r2Configured: Object.values(r2).every(Boolean),
  nodeEnv,
  port,
  mongodbUri,
  mongodbDbName,
  authServiceUrl,
  internalServiceSecret,
  rabbitmqUrl,
  redisUrl,
  notificationQueue: "internflare.notifications",
  trustedOrigins,
  isProduction: nodeEnv === "production",
};
