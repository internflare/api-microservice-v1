import { app } from "./app.js";
import { config } from "./config.js";
import { closeDb, connectDb } from "./db/mongoose.js";
import { closeNotificationPublisher } from "./services/notification-publisher.service.js";
import { closeCache, connectCache } from "./services/cache.service.js";

async function start(): Promise<void> {
  await connectDb();
  await connectCache();
  const server = app.listen(config.port, () => {
    console.log(`[profile-service] Server running on port ${config.port} in ${config.nodeEnv} mode`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[profile-service] Received ${signal}. Shutting down gracefully...`);
    server.close((error) => {
      if (error) {
        console.error("[profile-service] Failed to close HTTP server:", error);
        process.exitCode = 1;
      } else {
        console.log("[profile-service] HTTP server closed.");
      }
      void Promise.all([closeDb(), closeNotificationPublisher(), closeCache()]).catch((closeError: unknown) => {
        console.error("[profile-service] Failed to close service resources:", closeError);
        process.exitCode = 1;
      });
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  server.on("error", (error) => {
    console.error("[profile-service] Failed to start HTTP server:", error);
    process.exitCode = 1;
  });
}

void start().catch(async (error: unknown) => {
  console.error("[profile-service] Failed to start:", error);
  try {
    await closeDb();
  } catch (closeError) {
    console.error("[profile-service] Failed to close MongoDB after startup failure:", closeError);
  }
  process.exitCode = 1;
});
