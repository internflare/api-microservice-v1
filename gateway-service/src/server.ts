import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import { config } from "./config.js";

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
  const connectionHeaders = headers.connection
    ?.split(",")
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

// Determine the target service based on the request path.
function getTarget(pathname: string): URL {
  // Keep the services' existing API paths intact while routing notification APIs and docs separately.
  if (
    pathname === "/api/v1/notifications" ||
    pathname.startsWith("/api/v1/notifications/") ||
    pathname === "/api/v1/docs" ||
    pathname.startsWith("/api/v1/docs/") ||
    pathname === "/api/v1/openapi.json"
  ) {
    return config.notificationServiceUrl;
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

// Create an HTTP server that forwards requests to the appropriate upstream service based on the request path.
const server = createServer((incoming, outgoing) => {
  const requestUrl = new URL(incoming.url ?? "/", "http://gateway.local");

  if (requestUrl.pathname === "/health" && incoming.method === "GET") {
    outgoing.writeHead(200, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const target = getTarget(requestUrl.pathname);
  const headers = forwardableHeaders(incoming.headers);
  headers.host = target.host;
  headers["x-forwarded-for"] = [
    incoming.headers["x-forwarded-for"],
    incoming.socket.remoteAddress,
  ]
    .filter(Boolean)
    .join(", ");
  headers["x-forwarded-host"] = incoming.headers.host;
  headers["x-forwarded-proto"] =
    incoming.headers["x-forwarded-proto"] ?? "http";

  const makeRequest = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = makeRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${requestUrl.pathname}${requestUrl.search}`,
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
  incoming.on("aborted", () => upstream.destroy());
  outgoing.on("close", () => {
    if (!outgoing.writableEnded) upstream.destroy();
  });
  incoming.pipe(upstream);
});

// Start the server and listen on the configured port.
server.listen(config.port, () => {
  console.info(`Gateway service listening on port ${config.port}`);
});

server.on("error", (error) => {
  console.error("Failed to start the gateway service:", error);
  process.exitCode = 1;
});
