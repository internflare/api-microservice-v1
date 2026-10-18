import { betterAuth } from "better-auth";
import * as Sentry from "@sentry/node";
import { Pool } from "pg";
import { resolve } from "node:path";
import { config, isProduction } from "./config.js";
import { queueSignupNotification } from "./services/notification-publisher.js";
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

// Better Auth manages password authentication and persists users and sessions in PostgreSQL.
const auth = betterAuth({
  database,
  secret: config.authSecret,
  baseURL: config.authUrl,
  trustedOrigins: config.trustedOrigins,
  emailAndPassword: {
    enabled: true,
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
