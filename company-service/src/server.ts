import { app } from "./app.js";
import { config } from "./config.js";

const server = app.listen(config.port, () => {
  console.log(`[company-service] Server running on port ${config.port} in ${config.nodeEnv} mode`);
});

const shutdown = (signal: string) => {
  console.log(`[company-service] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("[company-service] HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
