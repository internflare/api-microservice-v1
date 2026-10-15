import { app } from "./app.js";
import { database } from "./auth.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

// Start the Express server and listen for incoming requests.
const server = app.listen(config.port, () => {
  logger("info", `Auth service listening on port ${config.port}`);
});

// Drain active HTTP requests before closing PostgreSQL connections on shutdown.
async function shutdown(signal: string): Promise<void> {
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
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.on("error", (error) => {
  logger("error", "Failed to start the auth service:", error);
  process.exitCode = 1;
});
