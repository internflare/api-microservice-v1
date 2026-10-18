import type { RequestHandler } from "express";
import { checkDatabaseConnection } from "../models/notification.model.js";

// Report healthy only when the notification database is reachable.
export const getHealth: RequestHandler = async (_request, response) => {
  await checkDatabaseConnection();
  response.status(200).json({ status: "ok" });
};
