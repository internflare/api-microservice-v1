import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

let listenersRegistered = false;

async function connectDb(uri: string, databaseName?: string): Promise<void> {
  if (!listenersRegistered) {
    mongoose.connection.on("connected", () => logger("info", "Connected to MongoDB"));
    mongoose.connection.on("disconnected", () => logger("warn", "MongoDB disconnected"));
    mongoose.connection.on("error", (error) => logger("error", "MongoDB connection error:", error));
    listenersRegistered = true;
  }

  try {
    await mongoose.connect(uri, {
      ...(databaseName ? { dbName: databaseName } : {}),
      serverSelectionTimeoutMS: 10_000,
    });
  } catch (error) {
    logger("error", "Failed to connect to MongoDB:", error);
    throw error;
  }
}

async function closeDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
}

export { closeDb, connectDb };
