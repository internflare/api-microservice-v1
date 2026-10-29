import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../utils/appError.js";
import { CompanyDocument, CompanyMemberDocument } from "./company.schema.js";
import { CompanyInviteDocument } from "./company-invite.schema.js";

export type InviteRole = "ADMIN" | "MEMBER";

export interface InviteDetails {
  company_id: string;
  company_name: string;
  email: string;
  workspace_role: InviteRole;
  invited_by: string;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export class CompanyInviteModel {
  /**
   * Creates (or re-issues) a pending invite and returns the raw token, which exists only
   * in the email link. Re-inviting the same email revokes the earlier pending invite.
   */
  static async createInvite(
    companyId: string,
    email: string,
    role: InviteRole,
    invitedBy: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    if (!mongoose.isValidObjectId(companyId)) throw new AppError("Company not found", 404);
    const normalizedEmail = email.trim().toLowerCase();

    await CompanyInviteDocument.updateMany(
      { company_id: companyId, email: normalizedEmail, status: "PENDING" },
      { $set: { status: "REVOKED" } },
    );

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await CompanyInviteDocument.create({
      company_id: companyId,
      email: normalizedEmail,
      workspace_role: role,
      token_hash: hashToken(token),
      invited_by: invitedBy,
      expires_at: expiresAt,
    });
    return { token, expiresAt };
  }

  // Resolves a usable invite (pending and unexpired) or throws a client-safe error.
  private static async findUsableInvite(token: string): Promise<any> {
    const invite: any = await CompanyInviteDocument.findOne({ token_hash: hashToken(token) });
    if (!invite) throw new AppError("This invitation link is invalid", 404);
    if (invite.status === "ACCEPTED") throw new AppError("This invitation has already been used", 410);
    if (invite.status === "REVOKED") throw new AppError("This invitation is no longer valid", 410);
    if (invite.expires_at.getTime() < Date.now()) throw new AppError("This invitation has expired", 410);
    return invite;
  }

  static async getInviteDetails(token: string): Promise<InviteDetails> {
    const invite = await this.findUsableInvite(token);
    const company: any = await CompanyDocument.findOne({ _id: invite.company_id, deleted_at: null }).lean();
    if (!company) throw new AppError("The company for this invitation no longer exists", 404);
    return {
      company_id: String(invite.company_id),
      company_name: company.name,
      email: invite.email,
      workspace_role: invite.workspace_role,
      invited_by: invite.invited_by,
    };
  }

  /**
   * Marks the invite accepted and links the user to the company as an ACTIVE member.
   * The caller must prove the account email matches the invited address.
   */
  static async acceptInvite(token: string, userId: string, userEmail: string): Promise<InviteDetails> {
    const invite = await this.findUsableInvite(token);
    if (invite.email !== userEmail.trim().toLowerCase()) {
      throw new AppError("This invitation was sent to a different email address", 403);
    }
    const details = await this.getInviteDetails(token);

    // Claim the invite atomically so a token cannot be redeemed twice concurrently.
    const claimed = await CompanyInviteDocument.findOneAndUpdate(
      { _id: invite._id, status: "PENDING" },
      { $set: { status: "ACCEPTED", accepted_by: userId, accepted_at: new Date() } },
    );
    if (!claimed) throw new AppError("This invitation has already been used", 410);

    await CompanyMemberDocument.findOneAndUpdate(
      { company_id: invite.company_id, user_id: userId },
      {
        $set: {
          workspace_role: invite.workspace_role,
          status: "ACTIVE",
          joined_at: new Date(),
          removed_at: null,
        },
      },
      { upsert: true, new: true },
    );
    return details;
  }
}
