import { betterAuth } from "better-auth";
import * as Sentry from "@sentry/node";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import type { Db } from "mongodb";
import { config, isProduction } from "./config.js";
import {
  queueEmailVerification,
  queuePasswordReset,
  queuePasswordChanged,
  type SignedUpUser,
} from "./services/notification-publisher.js";
import { logger } from "./utils/logger.js";

// Map a Better Auth user to the minimal payload sent to notification-service.
function toNotificationUser(user: {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}): SignedUpUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}

// Report a failed publish to Sentry and the logs; shared by the reset and verification hooks.
function reportPublishFailure(
  operation: string,
  message: string,
  error: unknown,
): void {
  Sentry.captureException(error, { tags: { operation } });
  logger("error", message, error);
}

// Better Auth manages password authentication and persists users and sessions in MongoDB.
function createAuth(database: Db) {
  return betterAuth({
    database: mongodbAdapter(database),
    secret: config.authSecret,
    baseURL: config.authUrl,
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      // Reset links stay valid for 30 minutes, matching the copy shown on the forgot-password page.
      resetPasswordTokenExpiresIn: 60 * 30,
      sendResetPassword: async ({ user, url }) => {
        // Embed the account email inside the frontend callback URL so it survives
        // Better Auth's backend redirect (which only forwards ?token=). The token
        // stays the only secret; the email alone cannot reset a password.
        let resetUrl = url;
        try {
          const outer = new URL(url);
          const callback = outer.searchParams.get("callbackURL");
          if (callback) {
            const inner = new URL(callback);
            inner.searchParams.set("email", user.email);
            outer.searchParams.set("callbackURL", inner.toString());
            resetUrl = outer.toString();
          }
        } catch {
          resetUrl = url;
        }
        // Do not await: awaiting would let response timing reveal whether the email exists.
        void queuePasswordReset(toNotificationUser(user), resetUrl).catch(
          (error: unknown) =>
            reportPublishFailure(
              "publish-password-reset",
              "Failed to enqueue password reset email:",
              error,
            ),
        );
      },
      onPasswordReset: async ({ user }) => {
        // Notify the user that the password was changed. Do not block the reset response.
        void queuePasswordChanged(toNotificationUser(user)).catch(
          (error: unknown) =>
            reportPublishFailure(
              "publish-password-changed",
              "Failed to enqueue password-changed email:",
              error,
            ),
        );
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await queueEmailVerification(toNotificationUser(user), url);
        } catch (error) {
          reportPublishFailure(
            "publish-email-verification",
            "Failed to enqueue email verification:",
            error,
          );
          throw error;
        }
      },
    },
    account: {
      encryptOAuthTokens: true,
    },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
      },
      apple: {
        clientId: config.appleClientId,
        clientSecret: config.appleClientSecret,
      },
      // Better Auth uses the canonical provider ID "twitter" for X.
      twitter: {
        clientId: config.xClientId,
        clientSecret: config.xClientSecret,
      },
      linkedin: {
        clientId: config.linkedinClientId,
        clientSecret: config.linkedinClientSecret,
      },
    },
    advanced: {
      useSecureCookies: isProduction,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: isProduction ? "none" : "lax",
        secure: isProduction,
      },
    },
  });
}

type AuthInstance = ReturnType<typeof createAuth>;
let authInstance: AuthInstance | undefined;

export function initializeAuth(database: Db): AuthInstance {
  authInstance = createAuth(database);
  return authInstance;
}

export function getAuth(): AuthInstance {
  if (!authInstance) {
    throw new Error("Better Auth has not been initialized");
  }
  return authInstance;
}
