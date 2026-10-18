import { app } from "./app.js";
import { config } from "./config.js";
import { database } from "./db/pool.js";
import { migrateDatabase } from "./db/migrate.js";
import {
  closeNotificationPublisher,
  connectNotificationPublisher,
} from "./services/notification-publisher.service.js";
import { logger } from "./utils/logger.js";

async function start(): Promise<void> {
  await migrateDatabase();
  await connectNotificationPublisher();

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
        ["PostgreSQL pool", () => database.end()],
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
    await database.end();
  } catch (databaseError) {
    logger("error", "Failed to close PostgreSQL after startup failure:", databaseError);
  }
  process.exitCode = 1;
});
