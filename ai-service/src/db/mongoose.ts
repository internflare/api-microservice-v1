import mongoose from "mongoose";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const connection = mongoose.connection;

connection.on("connected", () => logger("info", "MongoDB connection established"));
connection.on("disconnected", () => logger("warn", "MongoDB connection disconnected"));
connection.on("error", (error) => logger("error", "MongoDB connection error:", error));

// Connect before serving requests; bound startup waits when Atlas is unavailable.
export async function connectDb(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri, {
      ...(config.mongodbDbName ? { dbName: config.mongodbDbName } : {}),
      serverSelectionTimeoutMS: 15_000,
    });
    logger("info", "AI service MongoDB database is ready");
  } catch (error) {
    logger("error", "Failed to connect to MongoDB:", error);
    throw error;
  }
}

// Release the shared MongoDB connection during shutdown.
export async function closeDb(): Promise<void> {
  try {
    await mongoose.disconnect();
  } catch (error) {
    logger("error", "Failed to close the MongoDB connection:", error);
    process.exitCode = 1;
  }
}
