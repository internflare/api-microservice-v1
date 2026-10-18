import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import { config } from "../config.js";

// Restrict delivery to trusted backend callers; never expose this credential to browsers.
export const requireApiKey: RequestHandler = (request, response, next) => {
  const authorization = request.get("authorization");
  const suppliedKey = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!suppliedKey) {
    response.status(401).json({ error: "Bearer API key required" });
    return;
  }

  const expected = Buffer.from(config.apiKey);
  const supplied = Buffer.from(suppliedKey);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    response.status(401).json({ error: "Invalid API key" });
    return;
  }

  next();
};
