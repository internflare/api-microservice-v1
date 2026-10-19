import { z } from "zod";

// ISO 3166-1 alpha-2 country code regex (2 uppercase letters)
const countryCodeRegex = /^[A-Z]{2}$/;

export const createCompanySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters long")
    .max(255, "Company name cannot exceed 255 characters"),
  website: z
    .string()
    .trim()
    .url("Website must be a valid URL")
    .max(255)
    .optional()
    .nullable(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(countryCodeRegex, "Country must be a 2-letter ISO country code (e.g., NG, US, GB)")
    .optional()
    .nullable(),
  industry: z
    .string()
    .trim()
    .max(100, "Industry cannot exceed 100 characters")
    .optional()
    .nullable(),
  registration_number: z
    .string()
    .trim()
    .max(100, "Registration number cannot exceed 100 characters")
    .optional()
    .nullable(),
  logo_url: z
    .string()
    .trim()
    .url("Logo URL must be a valid URL")
    .max(500)
    .optional()
    .nullable(),
});

export const updateCompanySchema = createCompanySchema.partial();

export const inviteMemberSchema = z.object({
  user_id: z
    .string()
    .trim()
    .min(1, "User ID is required"),
  workspace_role: z.enum(["ADMIN", "MEMBER"], {
    errorMap: () => ({ message: "workspace_role must be either ADMIN or MEMBER" }),
  }),
});

export const verificationDocumentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Document title must be at least 2 characters")
    .max(255),
  url: z
    .string()
    .trim()
    .url("Document URL must be a valid URL")
    .max(500),
  document_type: z
    .string()
    .trim()
    .max(100)
    .optional(),
  uploaded_at: z
    .string()
    .datetime({ offset: true })
    .optional()
    .default(() => new Date().toISOString()),
});

export const submitVerificationSchema = z.object({
  registration_number: z
    .string()
    .trim()
    .max(100)
    .optional(),
  documents: z
    .array(verificationDocumentSchema)
    .min(1, "At least one verification document is required"),
});

export const adminVerificationDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], {
    errorMap: () => ({ message: "Decision status must be either APPROVED or REJECTED" }),
  }),
  review_notes: z
    .string()
    .trim()
    .max(2000, "Review notes cannot exceed 2000 characters")
    .optional()
    .nullable(),
});

export const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid UUID format"),
});

export const memberParamSchema = z.object({
  id: z.string().uuid("Invalid company UUID format"),
  memberId: z.string().uuid("Invalid member UUID format"),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;
export type AdminVerificationDecisionInput = z.infer<typeof adminVerificationDecisionSchema>;
