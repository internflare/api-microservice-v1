import type { RequestHandler } from "express";
import mongoose from "mongoose";
import { logger } from "../utils/logger.js";

// Report healthy only when MongoDB is connected and responds to a ping.
export const getHealth: RequestHandler = async (_request, response) => {
  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      response.status(503).json({ status: "unavailable" });
      return;
    }
    await mongoose.connection.db.admin().ping();
    response.status(200).json({ status: "ok" });
  } catch (error) {
    logger("error", "AI service health check failed:", error);
    response.status(503).json({ status: "unavailable" });
  }
};
