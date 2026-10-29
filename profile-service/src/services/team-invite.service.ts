import { CompanyInviteModel, type InviteRole } from "../models/company-invite.model.js";
import { publishTeamInviteEmail } from "./notification-publisher.service.js";

export interface InviteResult {
  email: string;
  sent: boolean;
  error?: string;
}

/**
 * Creates an invite per address and emails each link. One failure never blocks the rest;
 * the per-address outcome is returned so callers can report or log it.
 */
export async function sendTeamInvites(
  company: { id: string; name: string },
  entries: Array<{ email: string; workspace_role: InviteRole }>,
  inviter: { id: string; name: string },
): Promise<InviteResult[]> {
  const unique = [...new Map(entries.map((entry) => [entry.email.toLowerCase(), entry])).values()];

  return Promise.all(
    unique.map(async (entry): Promise<InviteResult> => {
      try {
        const { token, expiresAt } = await CompanyInviteModel.createInvite(
          company.id,
          entry.email,
          entry.workspace_role,
          inviter.id,
        );
        await publishTeamInviteEmail({
          email: entry.email.toLowerCase(),
          token,
          companyName: company.name,
          inviterName: inviter.name,
          role: entry.workspace_role,
          expiresAt,
        });
        return { email: entry.email, sent: true };
      } catch (error) {
        console.error(`[profile-service] Team invite to ${entry.email} failed:`, error);
        return { email: entry.email, sent: false, error: "Could not send this invitation" };
      }
    }),
  );
}
