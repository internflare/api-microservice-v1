import type { RequestHandler } from "express";

// Keeps unknown API paths consistent with the service's JSON response format.
export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({ error: "Not found" });
};
