import "./instrument.js";
import * as Sentry from "@sentry/node";
import mongoose from "mongoose";
import { initializeAuth } from "./auth.js";
import { config } from "./config.js";
import { closeDb, connectDb } from "./db/mongoose.js";
import { closeNotificationPublisher } from "./services/notification-publisher.js";
import { logger } from "./utils/logger.js";

async function startServer(): Promise<void> {
  await connectDb(config.mongoUri, config.mongoDbName);
  initializeAuth(mongoose.connection.getClient().db(config.mongoDbName));

  const { app } = await import("./app.js");
  const server = app.listen(config.port, () => {
    logger("info", `Auth service listening on port ${config.port}`);
  });

  let shuttingDown = false;

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
        await closeDb();
      } catch {
        process.exitCode = 1;
      }

      try {
        await closeNotificationPublisher();
        logger("info", "RabbitMQ publisher closed successfully");
      } catch (publisherError) {
        logger("error", "Failed to close the RabbitMQ publisher:", publisherError);
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
}

void startServer().catch((error: unknown) => {
  logger("error", "Failed to start the auth service:", error);
  process.exitCode = 1;
});
