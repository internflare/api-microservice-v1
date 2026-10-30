import { AppError } from "./appError.js";
import { formatValidationError } from "../validators/opportunity.validator.js";

// Unwraps a zod safeParse result, turning a failure into a 400 that lists the bad fields.
export const parseOrFail = <T>(
  result: { success: true; data: T } | { success: false; error: any },
  message: string,
): T => {
  if (!result.success) {
    throw new AppError(
      `${message}: ${JSON.stringify(formatValidationError(result.error).fieldErrors)}`,
      400,
    );
  }
  return result.data;
};
