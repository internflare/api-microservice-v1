import mongoose from "mongoose";
import { config } from "../config.js";
import { Notification } from "../models/notification.model.js";
import { logger } from "../utils/logger.js";

const serverSelectionTimeoutMS = 5_000;

mongoose.connection.on("connected", () => {
  logger("info", "Connected to MongoDB");
});
mongoose.connection.on("disconnected", () => {
  logger("warn", "MongoDB connection disconnected");
});
mongoose.connection.on("error", (error) => {
  logger("error", "MongoDB connection error:", error);
});

export async function connectDb(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS,
      ...(config.mongodbDbName ? { dbName: config.mongodbDbName } : {}),
    });
    await Notification.init();
    logger("info", "Notification database indexes are ready");
  } catch (error) {
    logger("error", "Failed to connect to MongoDB:", error);
    throw error;
  }
}

export async function closeDb(): Promise<void> {
  await mongoose.disconnect();
  logger("info", "MongoDB connection closed");
}
