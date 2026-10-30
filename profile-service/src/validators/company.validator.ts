import { z } from "zod";

const countryCodeRegex = /^[A-Z]{2}$/;
const objectIdRegex = /^[a-f\d]{24}$/i;

export const teamInviteEntrySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid invite email").max(255),
  workspace_role: z.enum(["ADMIN", "MEMBER"]).default("ADMIN"),
});
export const teamInvitesSchema = z.object({
  invites: z.array(teamInviteEntrySchema).min(1, "Add at least one invite").max(20, "You can send up to 20 invites at once"),
});
export const inviteTokenParamSchema = z.object({ token: z.string().trim().min(20).max(200) });
export const acceptInviteBodySchema = z.object({
  user_id: z.string().trim().min(1),
  email: z.string().trim().email(),
});

export const createCompanySchema = z.object({
  invites: z.array(teamInviteEntrySchema).max(20).optional(),
  name: z.string().trim().min(2, "Company name must be at least 2 characters long").max(255, "Company name cannot exceed 255 characters"),
  website: z.string().trim().url("Website must be a valid URL").max(255).optional().nullable(),
  country: z.string().trim().toUpperCase().regex(countryCodeRegex, "Country must be a 2-letter ISO country code (e.g., NG, US, GB)").optional().nullable(),
  industry: z.string().trim().max(100, "Industry cannot exceed 100 characters").optional().nullable(),
  registration_number: z.string().trim().max(100, "Registration number cannot exceed 100 characters").optional().nullable(),
  contact_email: z.string().trim().email("Contact email must be valid").max(255).optional().nullable(),
  phone: z.string().trim().max(40, "Phone cannot exceed 40 characters").optional().nullable(),
  representative_name: z.string().trim().max(120).optional().nullable(),
  representative_title: z.string().trim().max(120).optional().nullable(),
  logo_url: z.string().trim().url("Logo URL must be a valid URL").max(500).optional().nullable(),
  description: z.string().trim().max(5000, "About text cannot exceed 5000 characters").optional().nullable(),
  culture: z.string().trim().max(3000, "Culture text cannot exceed 3000 characters").optional().nullable(),
});
export const updateCompanySchema = createCompanySchema.partial();
export const inviteMemberSchema = z.object({
  user_id: z.string().trim().min(1, "User ID is required"),
  workspace_role: z.enum(["ADMIN", "MEMBER"], { errorMap: () => ({ message: "workspace_role must be either ADMIN or MEMBER" }) }),
});
export const verificationDocumentSchema = z.object({
  title: z.string().trim().min(2, "Document title must be at least 2 characters").max(255),
  url: z.string().trim().url("Document URL must be a valid URL").max(500),
  document_type: z.string().trim().max(100).optional(),
  uploaded_at: z.string().datetime({ offset: true }).optional().default(() => new Date().toISOString()),
});
export const submitVerificationSchema = z.object({
  registration_number: z.string().trim().max(100).optional(),
  documents: z.array(verificationDocumentSchema).min(1, "At least one verification document is required"),
});
export const adminVerificationDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"], { errorMap: () => ({ message: "Decision status must be either APPROVED or REJECTED" }) }),
  review_notes: z.string().trim().max(2000, "Review notes cannot exceed 2000 characters").optional().nullable(),
});
export const objectIdParamSchema = z.object({ id: z.string().regex(objectIdRegex, "Invalid ObjectId format") });
export const memberParamSchema = z.object({
  id: z.string().regex(objectIdRegex, "Invalid company ObjectId format"),
  memberId: z.string().regex(objectIdRegex, "Invalid member ObjectId format"),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;
export type AdminVerificationDecisionInput = z.infer<typeof adminVerificationDecisionSchema>;
