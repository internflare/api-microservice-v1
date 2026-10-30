import type { Request } from "express";
import { config } from "../config.js";
import { AppError } from "../utils/appError.js";

export interface ListingFacts {
  title?: string;
  description?: string;
  opportunity_type?: string;
  experience_level?: string | null;
  work_arrangement?: string;
  location?: string | null;
  external_company_name?: string | null;
  skills_required?: string[] | null;
  responsibilities?: string | null;
  role_id?: string | null;
  status?: string;
}

export interface EligibilityFacts {
  state?: string;
  role_id?: string | null;
  required_placement?: string;
  placement?: string | null;
  overall_score?: number | null;
}

const forwardedHeaders = (req: Request) => ({
  ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
  ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}),
});

async function getJson<T>(req: Request, path: string): Promise<{ status: number; body: T | null }> {
  try {
    const response = await fetch(`${config.jobListingServiceUrl}${path}`, {
      headers: forwardedHeaders(req),
      signal: AbortSignal.timeout(8_000),
    });
    return { status: response.status, body: response.ok ? ((await response.json()) as T) : null };
  } catch {
    throw new AppError("Job listing service is unavailable", 503);
  }
}

// Loads a listing the talent chose as context. 404 when it no longer exists.
export async function fetchListing(req: Request, opportunityId: string): Promise<ListingFacts> {
  const { status, body } = await getJson<{ opportunity?: ListingFacts }>(
    req,
    `/opportunities/${opportunityId}`,
  );
  if (status === 404) throw new AppError("That listing no longer exists", 404);
  if (!body?.opportunity) throw new AppError("Could not load the listing", 502);
  return body.opportunity;
}

// Server-side eligibility for the talent; best effort, the tool still works without it.
export async function fetchEligibility(
  req: Request,
  opportunityId: string,
): Promise<EligibilityFacts | null> {
  const { body } = await getJson<EligibilityFacts>(req, `/opportunities/${opportunityId}/eligibility`);
  return body;
}
