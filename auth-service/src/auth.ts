import { betterAuth } from "better-auth";
import * as Sentry from "@sentry/node";
import { Pool } from "pg";
import { resolve } from "node:path";
import { config, isProduction } from "./config.js";
import {
  queueEmailVerification,
  queuePasswordReset,
  queueSignupNotification,
} from "./services/notification-publisher.js";
import { logger } from "./utils/logger.js";

// Configure the PostgreSQL connection string to require SSL with full verification.
const databaseUrl = new URL(config.databaseUrl);
databaseUrl.searchParams.set("sslmode", "verify-full");
databaseUrl.searchParams.set(
  "sslrootcert",
  resolve(process.cwd(), "..", "ca.pem"),
);

// Better Auth uses a PostgreSQL connection pool to manage database connections.
const database = new Pool({
  connectionString: databaseUrl.toString(),
});

database.on("error", (error) => {
  logger("error", "Unexpected idle auth PostgreSQL connection error:", error);
});

// Better Auth manages password authentication and persists users and sessions in PostgreSQL.
const auth = betterAuth({
  database,
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
      // Do not await: awaiting would let response timing reveal whether the email exists.
      void queuePasswordReset(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        },
        url,
      ).catch((error: unknown) => {
        Sentry.captureException(error, {
          tags: { operation: "publish-password-reset" },
        });
        logger("error", "Failed to enqueue password reset email:", error);
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        await queueEmailVerification(
          {
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt.toISOString(),
          },
          url,
        );
      } catch (error) {
        Sentry.captureException(error, {
          tags: { operation: "publish-email-verification" },
        });
        logger("error", "Failed to enqueue email verification:", error);
        throw error;
      }
    },
  },
  account: {
    encryptOAuthTokens: true,
  },
  databaseHooks: {
    user: {
      create: {
        // queue only after Better Auth has created the user record successfully.
        after: async (user) => {
          try {
            await queueSignupNotification({
              id: user.id,
              name: user.name,
              email: user.email,
              createdAt: user.createdAt.toISOString(),
            });
          } catch (error) {
            // A notification outage must not turn a successful account creation into a failed signup.
            Sentry.captureException(error, {
              tags: { operation: "publish-signup-notification" },
            });
            logger(
              "error",
              "Failed to enqueue the signup notification:",
              error,
            );
          }
        },
      },
    },
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

export { auth, database };
