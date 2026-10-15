import { database } from "../auth.js";

// The model owns the persistence check used by the health endpoint.
export async function checkDatabaseConnection(): Promise<void> {
  await database.query("SELECT 1");
}
