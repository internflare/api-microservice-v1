import type { CompanyMember } from "./company.types.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  [key: string]: unknown;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      companyMember?: CompanyMember;
    }
  }
}
