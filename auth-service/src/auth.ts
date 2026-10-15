import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { config, isProduction } from "./config.js";

//database connection
const database = new Pool({
  connectionString: config.databaseUrl,
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
  socialProviders: {
    google: {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
    },
    apple: {
      clientId: config.appleClientId,
      clientSecret: config.appleClientSecret,
    },
    x: {
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
