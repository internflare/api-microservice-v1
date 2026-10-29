import mongoose from "mongoose";
import { config } from "../config.js";

const SERVER_SELECTION_TIMEOUT_MS = 10_000;

export async function connectDb(): Promise<void> {
  mongoose.connection.on("connected", () => console.log("[profile-service] MongoDB connected"));
  mongoose.connection.on("disconnected", () => console.warn("[profile-service] MongoDB disconnected"));
  mongoose.connection.on("error", (error: Error) => console.error("[profile-service] MongoDB connection error:", error));

  try {
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
      ...(config.mongodbDbName ? { dbName: config.mongodbDbName } : {}),
    });
  } catch (error) {
    console.error("[profile-service] MongoDB connection failed:", error);
    throw error;
  }
}

export async function closeDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
