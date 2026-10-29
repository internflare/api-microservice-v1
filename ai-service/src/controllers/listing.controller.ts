import type { RequestHandler } from "express";
import { draftListingDescription } from "../services/listing-description.service.js";
import { formatValidationError } from "../validators/assessment.validator.js";
import { draftDescriptionSchema } from "../validators/listing.validator.js";

// POST /ai/listings/description - generate a description from the listing details entered so far.
export const draftDescription: RequestHandler = async (req, res, next) => {
  const parsed = draftDescriptionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request",
      details: formatValidationError(parsed.error),
    });
    return;
  }
  try {
    const description = await draftListingDescription(parsed.data);
    res.status(200).json({ description });
  } catch (error) {
    next(error);
  }
};
