import { database } from "./pool.js";
import { migrateDatabase } from "./migrate.js";
import { logger } from "../utils/logger.js";

let failed = false;

try {
  await migrateDatabase();
} catch (error) {
  logger("error", "Notification database migration failed:", error);
  failed = true;
}

try {
  await database.end();
} catch (error) {
  logger("error", "Failed to close the PostgreSQL pool after migration:", error);
  failed = true;
}

if (failed) process.exitCode = 1;
