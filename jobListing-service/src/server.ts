import { app } from "./app.js";
import { config } from "./config.js";
import { closeDb, connectDb } from "./db/mongoose.js";
import {
  closeNotificationPublisher,
  connectNotificationPublisher,
} from "./services/notification-publisher.service.js";
import { closeCache, connectCache } from "./services/cache.service.js";
import { ensureViewIndexes } from "./models/opportunity-view.model.js";
import { logger } from "./utils/logger.js";

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isTransientRabbitError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return [
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
  ].includes(String(error.code));
}

// Keep the service alive during broker startup; Compose health checks will hold the gateway until it reconnects.
async function connectToNotificationQueue(): Promise<void> {
  while (true) {
    try {
      await connectNotificationPublisher();
      return;
    } catch (error) {
      if (!isTransientRabbitError(error)) throw error;
      logger(
        "warn",
        "RabbitMQ is not ready; retrying the job notification publisher in 3 seconds:",
        error,
      );
      await wait(3_000);
    }
  }
}

async function start(): Promise<void> {
  await connectDb(config.mongoUri, config.mongoDbName);
  await ensureViewIndexes();
  await connectCache();
  await connectToNotificationQueue();

  const server = app.listen(config.port, () => {
    logger("info", `Job listing service listening on port ${config.port}`);
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger("info", `${signal} received; shutting down job listing service`);

    server.close(async (error) => {
      if (error) {
        logger("error", "Failed to close the HTTP server cleanly:", error);
        process.exitCode = 1;
      }

      for (const [label, closeResource] of [
        ["RabbitMQ publisher", closeNotificationPublisher],
        ["Redis cache", closeCache],
        ["MongoDB connection", closeDb],
      ] as const) {
        try {
          await closeResource();
        } catch (resourceError) {
          logger("error", `Failed to close ${label}:`, resourceError);
          process.exitCode = 1;
        }
      }
    });
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  server.on("error", (error) => {
    logger("error", "Failed to start the job listing service:", error);
    process.exitCode = 1;
  });
}

void start().catch(async (error: unknown) => {
  logger("error", "Failed to start the job listing service:", error);
  try {
    await closeNotificationPublisher();
  } catch (publisherError) {
    logger("error", "Failed to close RabbitMQ after startup failure:", publisherError);
  }
  try {
    await closeCache();
  } catch (cacheError) {
    logger("error", "Failed to close Redis after startup failure:", cacheError);
  }
  try {
    await closeDb();
  } catch (databaseError) {
    logger("error", "Failed to close MongoDB after startup failure:", databaseError);
  }
  process.exitCode = 1;
});
