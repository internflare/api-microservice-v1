import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { config } from "./config.js";
import { openApiDocument } from "./docs/openapi.js";

const documentationApp = express();
const apiVersion = "/api/v1";
const upstreamServices = [
  { name: "auth-service", url: config.authServiceUrl },
  { name: "notification-service", url: config.notificationServiceUrl },
  { name: "joblisting-service", url: config.jobListingServiceUrl },
  { name: "profile-service", url: config.profileServiceUrl },
];

documentationApp.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});
documentationApp.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument),
);

// Hop-by-hop headers are headers that are meaningful only for a single transport-level connection and should not be forwarded by proxies or gateways. See https://www.rfc-editor.org/rfc/rfc2616#section-13.5.1
const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// Forwardable headers are all headers except hop-by-hop headers and any headers listed in the Connection header.
function forwardableHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const connectionValues = Array.isArray(headers.connection)
    ? headers.connection
    : headers.connection
      ? [headers.connection]
      : [];
  const connectionHeaders = connectionValues
    .flatMap((value) => value.split(","))
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const excludedHeaders = new Set([
    ...hopByHopHeaders,
    ...(connectionHeaders ?? []),
  ]);

  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !excludedHeaders.has(name)),
  );
}

// Route public versioned paths to the owning backend service.
function getTarget(pathname: string): URL {
  if (
    pathname === `${apiVersion}/me` ||
    pathname.startsWith(`${apiVersion}/me/`) ||
    pathname === `${apiVersion}/health`
  ) {
    return config.authServiceUrl;
  }

  if (
    pathname === `${apiVersion}/opportunities` ||
    pathname.startsWith(`${apiVersion}/opportunities/`)
  ) {
    return config.jobListingServiceUrl;
  }

  if (
    pathname === `${apiVersion}/notifications` ||
    pathname.startsWith(`${apiVersion}/notifications/`) ||
    pathname === `${apiVersion}/docs` ||
    pathname.startsWith(`${apiVersion}/docs/`) ||
    pathname === `${apiVersion}/openapi.json`
  ) {
    return config.notificationServiceUrl;
  }

  if (
    pathname === `${apiVersion}/auth` ||
    pathname.startsWith(`${apiVersion}/auth/`) ||
    pathname === `${apiVersion}/admin/verifications` ||
    pathname.startsWith(`${apiVersion}/admin/verifications/`) ||
    pathname === `${apiVersion}/admin` ||
    pathname.startsWith(`${apiVersion}/admin/`) ||
    pathname === `${apiVersion}/internal/companies` ||
    pathname.startsWith(`${apiVersion}/internal/companies/`)
  ) {
    return config.profileServiceUrl;
  }

  return config.authServiceUrl;
}

// Send a 502 Bad Gateway response to the client when an upstream service is unavailable.
function sendBadGateway(response: ServerResponse, error: Error): void {
  console.error("Gateway failed to reach an upstream service:", error);

  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }

  response.writeHead(502, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "Upstream service unavailable" }));
}

async function logUpstreamServiceStatuses(): Promise<void> {
  const statuses = await Promise.all(
    upstreamServices.map(async (service) => {
      try {
        const response = await fetch(new URL("/health", service.url), {
          signal: AbortSignal.timeout(5_000),
        });
        return {
          name: service.name,
          status: response.ok
            ? `healthy (HTTP ${response.status})`
            : `unhealthy (HTTP ${response.status})`,
          healthy: response.ok,
        };
      } catch (error) {
        return {
          name: service.name,
          status: `unavailable (${error instanceof Error ? error.message : String(error)})`,
          healthy: false,
        };
      }
    }),
  );

  for (const service of statuses) {
    const message = `[gateway] ${service.name}: ${service.status}`;
    if (service.healthy) {
      console.info(message);
    } else {
      console.error(message);
    }
  }
}

// Create an HTTP server that forwards requests to the appropriate upstream service based on the request path.
const server = createServer((incoming, outgoing) => {
  let requestUrl: URL;
  try {
    requestUrl = new URL(incoming.url ?? "/", "http://gateway.local");
  } catch (error) {
    console.warn("Rejected malformed gateway request URL:", error);
    outgoing.writeHead(400, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "Invalid request URL" }));
    return;
  }

  if (
    requestUrl.pathname === "/openapi.json" ||
    requestUrl.pathname === "/docs" ||
    requestUrl.pathname.startsWith("/docs/")
  ) {
    documentationApp(incoming, outgoing);
    return;
  }

  if (requestUrl.pathname === "/health" && incoming.method === "GET") {
    outgoing.writeHead(200, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Forward the request to the appropriate upstream service based on the request path.
  const target = getTarget(requestUrl.pathname);
  const upstreamPath = requestUrl.pathname.startsWith(`${apiVersion}/`)
    ? `${requestUrl.pathname.slice(apiVersion.length)}${requestUrl.search}`
    : `${requestUrl.pathname}${requestUrl.search}`;
  const headers = forwardableHeaders(incoming.headers);
  headers.host = target.host;
  // Do not trust a client-supplied X-Forwarded-For value unless a trusted-proxy policy is configured.
  headers["x-forwarded-for"] = incoming.socket.remoteAddress;
  headers["x-forwarded-host"] = incoming.headers.host;
  headers["x-forwarded-proto"] =
    incoming.headers["x-forwarded-proto"] ?? "http";

  const makeRequest = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = makeRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: upstreamPath,
      method: incoming.method,
      headers,
    },
    (upstreamResponse) => {
      const responseHeaders = forwardableHeaders(upstreamResponse.headers);
      outgoing.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
      // Stream bodies in both directions so uploads and large responses are not buffered in memory.
      upstreamResponse.pipe(outgoing);
      upstreamResponse.on("error", (error) => sendBadGateway(outgoing, error));
    },
  );

  upstream.on("error", (error) => sendBadGateway(outgoing, error));
  // Bound upstream waits so slow or stalled services cannot hold client connections indefinitely.
  upstream.setTimeout(30_000, () => {
    upstream.destroy(new Error("Upstream request timed out"));
  });
  incoming.on("aborted", () => upstream.destroy());
  incoming.on("error", (error) => {
    console.warn("Incoming gateway request failed:", error);
    upstream.destroy(error);
  });
  outgoing.on("error", (error) => {
    console.warn("Gateway response stream failed:", error);
    upstream.destroy();
  });
  outgoing.on("close", () => {
    if (!outgoing.writableEnded) upstream.destroy();
  });
  incoming.pipe(upstream);
});

// Start the server and listen on the configured port.
server.listen(config.port, () => {
  console.info(`Gateway service listening on port ${config.port}`);
  void logUpstreamServiceStatuses();
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} received; shutting down gateway service`);

  server.close((error) => {
    if (error) {
      console.error("Failed to close the gateway server cleanly:", error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

server.on("error", (error) => {
  console.error("Failed to start the gateway service:", error);
  process.exitCode = 1;
});
