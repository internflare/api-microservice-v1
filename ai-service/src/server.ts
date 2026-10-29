import { app } from "./app.js";
import { config } from "./config.js";
import { closeDb, connectDb } from "./db/mongoose.js";
import { closeNotificationPublisher } from "./services/notification-publisher.service.js";
import { logger } from "./utils/logger.js";

async function start(): Promise<void> {
  await connectDb();

  const server = app.listen(config.port, () => {
    logger("info", `AI service listening on port ${config.port}`);
  });

  let shuttingDown = false;
  // Stop HTTP work, then release RabbitMQ and MongoDB.
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger("info", `${signal} received; shutting down AI service`);
    server.close(async (error) => {
      if (error) {
        logger("error", "Failed to close the HTTP server cleanly:", error);
        process.exitCode = 1;
      }
      await closeNotificationPublisher();
      await closeDb();
    });
  }

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  server.on("error", (error) => {
    logger("error", "AI service server error:", error);
    process.exitCode = 1;
  });
}

void start().catch(async (error: unknown) => {
  logger("error", "Failed to start the AI service:", error);
  await closeDb();
  process.exitCode = 1;
});
