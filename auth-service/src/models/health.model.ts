import mongoose from "mongoose";

// Healthy only when MongoDB answers a ping; a stale readyState alone is not trusted.
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}
