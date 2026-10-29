import { config } from "../config.js";
import { AppError } from "../utils/appError.js";

export interface InviteDetails {
  company_id: string;
  company_name: string;
  email: string;
  workspace_role: "ADMIN" | "MEMBER";
}

// Calls a profile-service internal invite endpoint and maps failures to client-safe AppErrors.
async function callProfile(path: string, init?: RequestInit): Promise<InviteDetails> {
  let response: Response;
  try {
    response = await fetch(new URL(path, config.profileServiceUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-internal-service-key": config.internalServiceSecret,
      },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new AppError("Invitation service is unavailable. Please try again.", 503);
  }

  const body = (await response.json().catch(() => ({}))) as {
    invite?: InviteDetails;
    message?: string;
    error?: string;
  };
  if (!response.ok || !body.invite) {
    const status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new AppError(body.message ?? body.error ?? "Could not process the invitation", status);
  }
  return body.invite;
}

const tokenPath = (token: string) => `/internal/invites/${encodeURIComponent(token)}`;

// Look up a usable invite by its emailed token.
export const fetchInvite = (token: string) => callProfile(tokenPath(token));

// Redeem the invite for a freshly created user so they join the company.
export const acceptInvite = (token: string, user: { id: string; email: string }) =>
  callProfile(`${tokenPath(token)}/accept`, {
    method: "POST",
    body: JSON.stringify({ user_id: user.id, email: user.email }),
  });
