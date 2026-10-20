import type { RequestHandler } from "express";
import { findSession } from "../models/session.model.js";
import { AppError } from "../utils/appError.js";

// Returns the current identity and session, rejecting requests without a session.
export const getCurrentSession: RequestHandler = async (
  request,
  response,
  next,
) => {
  const session = await findSession(request.headers);

  // If no session is found, respond with an error
  if (!session) {
    next(new AppError("Unauthorized", 401));
    return;
  }

  response.json(session);
};
