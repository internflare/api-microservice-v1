import type { RequestHandler } from "express";
import { AppError } from "../utils/appError.js";

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new AppError(`Route not found: ${request.method} ${request.path}`, 404));
};
