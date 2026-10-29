import { config } from "../config.js";
import { AppError } from "../utils/appError.js";

interface CompanyAccessResponse {
  company?: {
    id: string;
    name: string;
    is_verified: boolean;
  };
  membership?: {
    workspace_role: string;
    status: string;
    has_access: boolean;
  } | null;
}

export async function requireCompanyAdmin(
  companyId: string,
  userId: string,
): Promise<{ id: string; name: string }> {
  let response: Response;
  try {
    // checking through fetch request
    response = await fetch(
      new URL(
        `/internal/companies/${encodeURIComponent(companyId)}/access/${encodeURIComponent(userId)}`,
        config.profileServiceUrl,
      ),
      {
        headers: {
          "x-internal-service-key": config.internalServiceSecret,
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
  } catch (error) {
    throw new AppError(
      error instanceof Error && error.name === "TimeoutError"
        ? "Company authorization service timed out"
        : "Company authorization service is unavailable",
      503,
    );
  }

  if (response.status === 404) {
    throw new AppError("Company not found", 404);
  }
  if (!response.ok) {
    throw new AppError("Could not verify company membership", 503);
  }

  const access = (await response.json()) as CompanyAccessResponse;
  if (
    !access.company ||
    !access.membership?.has_access ||
    access.membership.workspace_role !== "ADMIN" ||
    access.membership.status !== "ACTIVE"
  ) {
    throw new AppError("Active company administrator access required", 403);
  }

  return { id: access.company.id, name: access.company.name };
}
