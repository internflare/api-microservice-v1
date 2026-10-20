import { app } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";

async function start(): Promise<void> {
  await runMigrations();

  const server = app.listen(config.port, () => {
    console.log(
      `[profile-service] Server running on port ${config.port} in ${config.nodeEnv} mode`,
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(
      `[profile-service] Received ${signal}. Shutting down gracefully...`,
    );
    server.close((error) => {
      if (error) {
        console.error("[profile-service] Failed to close HTTP server:", error);
        process.exitCode = 1;
      } else {
        console.log("[profile-service] HTTP server closed.");
      }

      void pool.end().catch((poolError: unknown) => {
        console.error(
          "[profile-service] Failed to close PostgreSQL pool:",
          poolError,
        );
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
    await pool.end();
  } catch (poolError) {
    console.error(
      "[profile-service] Failed to close PostgreSQL pool after startup failure:",
      poolError,
    );
  }
  process.exitCode = 1;
});
