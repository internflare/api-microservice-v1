import type { RequestHandler } from "express";
import { getAuth } from "../auth.js";
import { acceptInvite, fetchInvite } from "../services/profile-invite.client.js";
import { AppError } from "../utils/appError.js";
import { inviteSignupSchema, inviteTokenSchema } from "../validators/invite.validator.js";

/**
 * GET /invites/:token
 * Public: returns the company name, invited email and role so the join page can greet the invitee.
 */
export const getInvite: RequestHandler = async (request, response, next) => {
  try {
    const token = inviteTokenSchema.safeParse(request.params.token);
    if (!token.success) throw new AppError("This invitation link is invalid", 404);

    const invite = await fetchInvite(token.data);
    response.json({
      company_name: invite.company_name,
      email: invite.email,
      workspace_role: invite.workspace_role,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /invites/signup
 * Creates the invitee's account (name + password only) with the invited email pre-verified,
 * then links it to the inviting company. The emailed token proves ownership of the address.
 */
export const signUpWithInvite: RequestHandler = async (request, response, next) => {
  try {
    const parsed = inviteSignupSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message ?? "Invalid request", 400);
    }
    const { token, name, password } = parsed.data;

    const invite = await fetchInvite(token);
    const context = await getAuth().$context;

    if (await context.internalAdapter.findUserByEmail(invite.email)) {
      throw new AppError("An account with this email already exists. Please sign in instead.", 409);
    }

    const user = await context.internalAdapter.createUser(
      { email: invite.email, name, emailVerified: true },
      { method: "email-password" },
    );
    await context.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await context.password.hash(password),
    });

    try {
      await acceptInvite(token, { id: user.id, email: invite.email });
    } catch (error) {
      // Roll back so the invitee can retry instead of owning an account with no company.
      await context.internalAdapter.deleteUser(user.id).catch(() => undefined);
      throw error;
    }

    response.status(201).json({ email: invite.email, company_name: invite.company_name });
  } catch (error) {
    next(error);
  }
};
