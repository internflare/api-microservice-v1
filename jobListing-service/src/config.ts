import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "3003", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

const rabbitmqUrl =
  process.env.RABBITMQ_URL?.trim() || "amqp://localhost:5672";
if (!["amqp:", "amqps:"].includes(new URL(rabbitmqUrl).protocol)) {
  throw new Error("RABBITMQ_URL must use the amqp:// or amqps:// protocol");
}

const frontendUrl =
  process.env.FRONTEND_URL?.trim() || "http://localhost:5173";
if (!["http:", "https:"].includes(new URL(frontendUrl).protocol)) {
  throw new Error("FRONTEND_URL must use the http:// or https:// protocol");
}

const config = {
  nodeEnv: process.env.NODE_ENV?.trim() || "development",
  port: parsePort(process.env.PORT),
  databaseUrl: requireEnv("DATABASE_URL"),
  databaseSsl: process.env.DATABASE_SSL?.trim().toLowerCase() === "true",
  rabbitmqUrl,
  notificationQueue: "internflare.notifications",
  frontendUrl,
};

export { config };
