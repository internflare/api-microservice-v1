import { readFile } from "node:fs/promises";
import { database } from "./pool.js";
import { logger } from "../utils/logger.js";

const initialMigration = new URL(
  "../../migrations/001_create_notifications.sql",
  import.meta.url,
);

// Apply the idempotent base schema before the service accepts requests or consumes events.
export async function migrateDatabase(): Promise<void> {
  const migrationSql = await readFile(initialMigration, "utf8");
  await database.query(migrationSql);
  logger("info", "Notification database schema is ready");
}
