import "dotenv/config";

// Helper function to require environment variables and throw an error if they are missing.
function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

//get variables
const googleClientId = requireEnv("GOOGLE_CLIENT_ID");
const googleClientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
const appleClientId = requireEnv("APPLE_CLIENT_ID");
const appleClientSecret = requireEnv("APPLE_CLIENT_SECRET");
const xClientId = requireEnv("X_CLIENT_ID");
const xClientSecret = requireEnv("X_CLIENT_SECRET");
const linkedinClientId = requireEnv("LINKEDIN_CLIENT_ID");
const linkedinClientSecret = requireEnv("LINKEDIN_CLIENT_SECRET");
const databaseUrl = requireEnv("DATABASE_URL");
const nodeEnv = requireEnv("NODE_ENV");

// Validate configuration during startup rather than failing later on incoming requests.
const port = Number.parseInt(process.env.PORT ?? "3001", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

//check if the auth secret is at least 32 characters long
const authSecret = requireEnv("BETTER_AUTH_SECRET");
if (authSecret.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long");
}

// Validate the auth URL
const authUrl = process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3001";
if (!authUrl.startsWith("http://") && !authUrl.startsWith("https://")) {
  throw new Error("BETTER_AUTH_URL must be a valid HTTP or HTTPS URL");
}

// Validate the CORS origins
const trustedOrigins = new Set([
  authUrl,
  ...(process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

const config = {
  nodeEnv,
  port,
  databaseUrl,
  googleClientId,
  googleClientSecret,
  appleClientId,
  appleClientSecret,
  xClientId,
  xClientSecret,
  linkedinClientId,
  linkedinClientSecret,
  authSecret,
  authUrl,
  trustedOrigins: [...trustedOrigins],
};

//check if in production
const isProduction = nodeEnv === "production";

export { config, isProduction };
