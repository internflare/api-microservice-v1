import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Read already applied migrations
    const { rows: appliedRows } = await client.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY id ASC",
    );
    const appliedSet = new Set(appliedRows.map((r) => r.name));

    // 3. Scan migrations directory
    const migrationsDir = path.join(__dirname, "migrations");
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    for (const sqlFile of sqlFiles) {
      if (appliedSet.has(sqlFile)) {
        console.log(`[migrate] Migration already applied: ${sqlFile}`);
        continue;
      }

      console.log(`[migrate] Applying migration: ${sqlFile}...`);
      const filePath = path.join(migrationsDir, sqlFile);
      const sqlContent = await fs.readFile(filePath, "utf-8");

      await client.query(sqlContent);
      await client.query(
        "INSERT INTO schema_migrations (name) VALUES ($1)",
        [sqlFile],
      );
      console.log(`[migrate] Successfully applied migration: ${sqlFile}`);
    }

    await client.query("COMMIT");
    console.log("[migrate] All migrations completed successfully.");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[migrate] Failed to roll back migration:", rollbackError);
    }
    console.error("[migrate] Migration failed; rollback was attempted", error);
    throw error;
  } finally {
    client.release();
  }
}

// Allow running directly via CLI: tsx src/db/migrate.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[migrate] Fatal migration error:", err);
      process.exit(1);
    });
}
