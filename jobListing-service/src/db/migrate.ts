import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { database } from "./pool.js";
import { logger } from "../utils/logger.js";

export async function migrateDatabase(): Promise<void> {
  const migrationPath = resolve(
    process.cwd(),
    "migrations",
    "001_create_opportunities.sql",
  );
  const migration = await readFile(migrationPath, "utf8");
  await database.query(migration);
  logger("info", "Job listing database migration completed");
}
