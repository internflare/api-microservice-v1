import type { RequestHandler } from "express";
import { checkDatabaseConnection } from "../models/opportunity.model.js";
import { connectNotificationPublisher } from "../services/notification-publisher.service.js";
import { logger } from "../utils/logger.js";

export const healthHandler: RequestHandler = async (_request, response) => {
  const [databaseResult, rabbitmqResult] = await Promise.allSettled([
    checkDatabaseConnection(),
    connectNotificationPublisher(),
  ]);
  const databaseStatus =
    databaseResult.status === "fulfilled" ? "connected" : "unavailable";
  const rabbitmqStatus =
    rabbitmqResult.status === "fulfilled" ? "connected" : "unavailable";

  if (databaseResult.status === "rejected") {
    logger("error", "Job listing database health check failed:", databaseResult.reason);
  }
  if (rabbitmqResult.status === "rejected") {
    logger("error", "Job listing RabbitMQ health check failed:", rabbitmqResult.reason);
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
