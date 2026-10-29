import { app } from "./app.js";
import * as Sentry from "@sentry/node";
import { config } from "./config.js";
import { closeDb, connectDb } from "./db/mongoose.js";
import { startSignupNotificationConsumer } from "./services/signup-consumer.service.js";
import { logger } from "./utils/logger.js";

async function start(): Promise<void> {
  let stopConsumer: (() => Promise<void>) | undefined;
  try {
    await connectDb();
    stopConsumer = await startSignupNotificationConsumer();
  } catch (error) {
    try {
      await stopConsumer?.();
    } catch (cleanupError) {
      logger(
        "error",
        "Failed to close signup notification consumer after startup failure:",
        cleanupError,
      );
    }
    try {
      await closeDb();
    } catch (cleanupError) {
      logger("error", "Failed to close MongoDB after startup failure:", cleanupError);
    }
    throw error;
  }

  const server = app.listen(config.port, () => {
    logger("info", `Notification service listening on port ${config.port}`);
  });

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger("info", `${signal} received; shutting down notification service`);
    server.close(async (error) => {
      if (error) {
        logger("error", "Failed to close the HTTP server cleanly:", error);
        process.exitCode = 1;
      }
      try {
        await stopConsumer?.();
      } catch (consumerError) {
        logger("error", "Failed to close the RabbitMQ consumer:", consumerError);
        process.exitCode = 1;
      }
      try {
        await closeDb();
      } catch (databaseError) {
        logger("error", "Failed to close MongoDB connection:", databaseError);
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
    logger("error", "Failed to start the notification service:", error);
    process.exitCode = 1;
  });
}

void start().catch((error: unknown) => {
  logger("error", "Failed to start the notification service:", error);
  void (async () => {
    try {
      await closeDb();
    } catch (cleanupError) {
      logger("error", "Failed to close MongoDB after startup failure:", cleanupError);
    }
    try {
      await Sentry.close(2_000);
    } catch (sentryError) {
      logger("error", "Failed to flush Sentry after startup failure:", sentryError);
    }
    process.exitCode = 1;
  })();
});
