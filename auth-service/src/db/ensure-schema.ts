import { database } from "../auth.js";
import { logger } from "../utils/logger.js";

try {
  await database.query("CREATE SCHEMA IF NOT EXISTS public");
  logger("info", "PostgreSQL public schema is ready");
} catch (error) {
  logger("error", "Failed to ensure the PostgreSQL public schema:", error);
  process.exitCode = 1;
} finally {
  try {
    await database.end();
  } catch (error) {
    logger("error", "Failed to close PostgreSQL after schema check:", error);
    process.exitCode = 1;
  }
}
