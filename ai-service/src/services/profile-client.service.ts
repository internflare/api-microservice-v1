import type { Request } from "express";
import { config } from "../config.js";
import { AppError } from "../utils/appError.js";
import type { TalentProfile } from "./profile-inference.service.js";

// Fetch the caller's talent profile from profile-service, forwarding their session credentials.
export async function fetchTalentProfile(req: Request): Promise<TalentProfile> {
  let response: Response;
  try {
    response = await fetch(`${config.profileServiceUrl}/talent/profile/me`, {
      headers: {
        ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
        ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new AppError("Profile service is unavailable", 503);
  }

  if (response.status === 404) {
    throw new AppError("Complete talent onboarding before taking an assessment", 409);
  }
  if (!response.ok) throw new AppError("Could not load your talent profile", 502);

  const body = (await response.json()) as { data?: { profile?: TalentProfile } };
  if (!body.data?.profile) throw new AppError("Could not load your talent profile", 502);
  return body.data.profile;
}
