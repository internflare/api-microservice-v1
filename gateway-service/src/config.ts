function parsePort(value: string | undefined): number {
  const port = Number.parseInt(value ?? "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseServiceUrl(name: string, fallback: string): URL {
  const value = process.env[name]?.trim() || fallback;
  const serviceUrl = new URL(value);

  if (
    !["http:", "https:"].includes(serviceUrl.protocol) ||
    serviceUrl.pathname !== "/" ||
    serviceUrl.search ||
    serviceUrl.hash
  ) {
    throw new Error(`${name} must be an HTTP or HTTPS service origin`);
  }

  return serviceUrl;
}

const config = {
  port: parsePort(process.env.PORT),
  authServiceUrl: parseServiceUrl("AUTH_SERVICE_URL", "http://localhost:3001"),
  notificationServiceUrl: parseServiceUrl(
    "NOTIFICATION_SERVICE_URL",
    "http://localhost:3002",
  ),
  jobListingServiceUrl: parseServiceUrl(
    "JOB_LISTING_SERVICE_URL",
    "http://localhost:3003",
  ),
  profileServiceUrl: parseServiceUrl(
    "PROFILE_SERVICE_URL",
    "http://localhost:3004",
  ),
};

export { config };
