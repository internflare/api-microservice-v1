import type { RequestHandler } from "express";
import { checkDatabaseConnection } from "../models/health.model.js";

// Reports healthy only when the service can also reach PostgreSQL.
export const getHealth: RequestHandler = async (_request, response) => {
  await checkDatabaseConnection();
  response.status(200).json({ status: "ok" });
};
