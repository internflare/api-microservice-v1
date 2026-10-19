import pg from "pg";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { config } from "../config.js";

const { Pool } = pg;

function createPoolConfig(): pg.PoolConfig {
  const connectionString = config.databaseUrl;
  const caPath = resolve(process.cwd(), "..", "ca.pem");

  if (config.databaseSsl && existsSync(caPath)) {
    return {
      connectionString,
      ssl: {
        rejectUnauthorized: true,
        ca: caPath,
      },
    };
  }

  return { connectionString };
}

export const pool = new Pool(createPoolConfig());
export const database = pool;
