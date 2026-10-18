import { database } from "./pool.js";
import { migrateDatabase } from "./migrate.js";
import { logger } from "../utils/logger.js";

try {
  await migrateDatabase();
} catch (error) {
  logger("error", "Job listing database migration failed:", error);
  process.exitCode = 1;
} finally {
  await database.end();
}
