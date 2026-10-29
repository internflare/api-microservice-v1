import type { Request, Response } from "express";
import type { ZodType } from "zod";

const DEFAULT_UNAUTHORIZED_BODY = { success: false, error: "Unauthorized" };

// Returns the authenticated user's id, or sends the 401 (custom body optional) and returns undefined.
// Callers must stop when undefined is returned.
export const getAuthenticatedUserId = (
  req: Request,
  res: Response,
  unauthorizedBody: Record<string, unknown> = DEFAULT_UNAUTHORIZED_BODY,
): string | undefined => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json(unauthorizedBody);
    return undefined;
  }
  return userId;
};

// Validates input against a schema; on failure sends the standard 400 and returns undefined.
export const parseOrReject = <T>(
  schema: ZodType<T>,
  input: unknown,
  res: Response,
  errorLabel = "Validation Error",
): T | undefined => {
  const result = schema.safeParse(input);
  if (!result.success) {
    res.status(400).json({
      success: false,
      error: errorLabel,
      details: result.error.flatten(),
    });
    return undefined;
  }
  return result.data;
};
