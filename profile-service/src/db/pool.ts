import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;

const databaseUrl = new URL(config.databaseUrl);
const sslMode = databaseUrl.searchParams.get("sslmode")?.toLowerCase();
const useSsl =
  config.databaseSsl || (sslMode !== undefined && sslMode !== "disable");

for (const parameter of [
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "uselibpqcompat",
]) {
  databaseUrl.searchParams.delete(parameter);
}

export const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: useSsl
    ? {
        ca: readFileSync(resolve(process.cwd(), "..", "ca.pem"), "utf8"),
        rejectUnauthorized: true,
      }
    : undefined,
});
export const database = pool;
