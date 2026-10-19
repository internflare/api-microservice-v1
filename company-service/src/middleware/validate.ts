import type { RequestHandler } from "express";
import { ZodError, type ZodTypeAny } from "zod";

export function validateBody<T extends ZodTypeAny>(schema: T): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsed = await schema.parseAsync(req.body);
      req.body = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Validation Error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T): RequestHandler {
  return async (req, res, next) => {
    try {
      const parsed = await schema.parseAsync(req.params);
      req.params = parsed as Record<string, string>;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: "Invalid URL parameters",
          details: error.issues.map((issue) => ({
            param: issue.path.join("."),
            message: issue.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}
