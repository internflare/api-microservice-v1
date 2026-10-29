export type CompanyVerificationStatus =
  | "UNVERIFIED"
  | "PENDING_REVIEW"
  | "VERIFIED"
  | "REJECTED";

export type CompanyMemberRole = "ADMIN" | "MEMBER";

export type CompanyMemberStatus = "INVITED" | "ACTIVE" | "REMOVED";

export type VerificationDecisionStatus = "APPROVED" | "REJECTED";

export type AuditLogAction =
  | "COMPANY_CREATED"
  | "COMPANY_UPDATED"
  | "MEMBER_INVITED"
  | "MEMBER_ACCEPTED"
  | "MEMBER_ROLE_UPDATED"
  | "MEMBER_REMOVED"
  | "VERIFICATION_SUBMITTED"
  | "COMPANY_VERIFIED"
  | "COMPANY_REJECTED";

export interface Company {
  id: string;
  name: string;
  website?: string | null;
  country?: string | null;
  industry?: string | null;
  registration_number?: string | null;
  logo_url?: string | null;
  description?: string | null;
  culture?: string | null;
  verification_status: CompanyVerificationStatus;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface CompanyMember {
  id: string;
  company_id: string;
  user_id: string;
  workspace_role: CompanyMemberRole;
  status: CompanyMemberStatus;
  joined_at?: Date | null;
  removed_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface VerificationDocument {
  title: string;
  url: string;
  document_type?: string;
  uploaded_at: string;
}

export interface CompanyVerification {
  id: string;
  company_id: string;
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  reviewer_id?: string | null;
  review_notes?: string | null;
  documents: VerificationDocument[];
  created_at: Date;
  decided_at?: Date | null;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  action: AuditLogAction;
  entity_type: "company" | "company_member" | "company_verification";
  entity_id: string;
  metadata?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: Date;
}
