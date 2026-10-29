import type { RequestHandler } from "express";
import mongoose from "mongoose";
import { connectNotificationPublisher } from "../services/notification-publisher.service.js";
import { logger } from "../utils/logger.js";

// Health check handler for the job listing service. It checks the status of the database and RabbitMQ connection.
const healthHandler: RequestHandler = async (_request, response) => {
  // Perform health checks for the database and RabbitMQ connection concurrently.
  const [databaseResult, rabbitmqResult] = await Promise.allSettled([
    Promise.resolve().then(() => {
      if (mongoose.connection.readyState !== 1) {
        throw new Error("MongoDB is not connected");
      }
    }),
    connectNotificationPublisher(),
  ]);
  const databaseStatus =
    databaseResult.status === "fulfilled" ? "connected" : "unavailable";
  const rabbitmqStatus =
    rabbitmqResult.status === "fulfilled" ? "connected" : "unavailable";

  if (databaseResult.status === "rejected") {
    logger(
      "error",
      "Job listing database health check failed:",
      databaseResult.reason,
    );
  }
  if (rabbitmqResult.status === "rejected") {
    logger(
      "error",
      "Job listing RabbitMQ health check failed:",
      rabbitmqResult.reason,
    );
  }

  const healthy =
    databaseResult.status === "fulfilled" &&
    rabbitmqResult.status === "fulfilled";
  response.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "unavailable",
    database: databaseStatus,
    rabbitmq: rabbitmqStatus,
  });
};

export { healthHandler };
