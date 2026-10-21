import type { RequestHandler } from "express";
import { config } from "../config.js";

const allowedMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const allowedHeaders = "Accept, Authorization, Content-Type";

export const corsMiddleware: RequestHandler = (request, response, next) => {
  const origin = request.get("origin");
  if (origin !== config.frontendUrl) {
    if (request.method === "OPTIONS") {
      response.status(403).end();
      return;
    }
    next();
    return;
  }

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.vary("Origin");

  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", allowedMethods);
    response.setHeader("Access-Control-Allow-Headers", allowedHeaders);
    response.status(204).end();
    return;
  }

  next();
};
