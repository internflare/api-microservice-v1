import { app } from "./app.js";
import * as Sentry from "@sentry/node";
import { config } from "./config.js";
import { database } from "./db/pool.js";
import { migrateDatabase } from "./db/migrate.js";
import { startSignupNotificationConsumer } from "./services/signup-consumer.service.js";
import { logger } from "./utils/logger.js";

async function start(): Promise<void> {
  // Prepare storage before consuming events so accepted notifications can be saved.
  await migrateDatabase();
  // Do not advertise readiness until storage and the durable email queue are ready.
  const stopConsumer = await startSignupNotificationConsumer();
  const server = app.listen(config.port, () => {
    logger("info", `Notification service listening on port ${config.port}`);
  });

  // Stop HTTP work and the message consumer before the process exits.
  async function shutdown(signal: string): Promise<void> {
    logger("info", `${signal} received; shutting down notification service`);
    server.close(async (error) => {
      if (error) {
        logger("error", "Failed to close the HTTP server cleanly:", error);
        process.exitCode = 1;
      }

      try {
        await stopConsumer();
      } catch (consumerError) {
        logger("error", "Failed to close the RabbitMQ consumer:", consumerError);
        process.exitCode = 1;
      }
      try {
        await database.end();
      } catch (databaseError) {
        logger("error", "Failed to close the PostgreSQL pool:", databaseError);
        process.exitCode = 1;
      }
      await Sentry.close(2_000);
    });
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  server.on("error", (error) => {
    logger("error", "Failed to start the notification service:", error);
    process.exitCode = 1;
  });
}

void start().catch((error: unknown) => {
  logger("error", "Failed to start the notification service:", error);
  process.exitCode = 1;
});
