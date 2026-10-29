import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

const connection = mongoose.connection;

connection.on("connected", () => {
  logger("info", "Connected to MongoDB");
});
connection.on("error", (error: unknown) => {
  logger("error", "MongoDB connection error:", error);
});
connection.on("disconnected", () => {
  logger("warn", "MongoDB connection disconnected");
});

export async function connectDb(uri: string, dbName?: string): Promise<void> {
  try {
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 });
  } catch (error) {
    logger("error", "Failed to connect to MongoDB:", error);
    throw error;
  }
}

export async function closeDb(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger("info", "MongoDB connection closed");
  } catch (error) {
    logger("error", "Failed to close MongoDB connection:", error);
    throw error;
  }
}
