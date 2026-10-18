import { app } from "./app.js";
import * as Sentry from "@sentry/node";
import { database } from "./auth.js";
import { config } from "./config.js";
import { closeNotificationPublisher } from "./services/notification-publisher.js";
import { logger } from "./utils/logger.js";

// Start the Express server and listen for incoming requests.
const server = app.listen(config.port, () => {
  logger("info", `Auth service listening on port ${config.port}`);
});

let shuttingDown = false;

// Drain HTTP requests and release PostgreSQL and RabbitMQ resources on shutdown.
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger("info", `${signal} received; shutting down auth service`);

  server.close(async (error) => {
    if (error) {
      logger("error", "Failed to close the HTTP server cleanly:", error);
      process.exitCode = 1;
    }

    try {
      await database.end();
    } catch (databaseError) {
      logger("error", "Failed to close the PostgreSQL pool:", databaseError);
      process.exitCode = 1;
    }

    try {
      await closeNotificationPublisher();
      logger("info", "RabbitMQ publisher closed successfully");
    } catch (publisherError) {
      logger(
        "error",
        "Failed to close the RabbitMQ publisher:",
        publisherError,
      );
      process.exitCode = 1;
    }
    try {
      await Sentry.close(2_000);
    } catch (sentryError) {
      logger("error", "Failed to flush Sentry during shutdown:", sentryError);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.on("error", (error) => {
  logger("error", "Failed to start the auth service:", error);
  process.exitCode = 1;
});
