import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const databaseUrl = new URL(config.databaseUrl);
const sslMode = databaseUrl.searchParams.get("sslmode")?.toLowerCase();
const useSsl =
  config.databaseSsl || (sslMode !== undefined && sslMode !== "disable");

// pg parses SSL query parameters by replacing the explicit ssl options below.
// Remove them so the shared CA certificate is always used for verification.
for (const parameter of [
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "uselibpqcompat",
]) {
  databaseUrl.searchParams.delete(parameter);
}

// Keep one bounded connection pool for HTTP handlers and the RabbitMQ consumer.
export const database = new pg.Pool({
  connectionString: databaseUrl.toString(),
  ssl: useSsl
    ? {
        ca: readFileSync(resolve(process.cwd(), "..", "ca.pem"), "utf8"),
        rejectUnauthorized: true,
      }
    : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

database.on("error", (error) => {
  logger("error", "Unexpected idle PostgreSQL connection error:", error);
});
