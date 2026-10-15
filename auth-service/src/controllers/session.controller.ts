import type { RequestHandler } from "express";
import { findSession } from "../models/session.model.js";

// Returns the current identity and session, rejecting requests without a session.
export const getCurrentSession: RequestHandler = async (request, response) => {
  const session = await findSession(request.headers);

  if (!session) {
    response.status(401).json({ error: "Unauthorized" });
    return;
  }

  response.json(session);
};
