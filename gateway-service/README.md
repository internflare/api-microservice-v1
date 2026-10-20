# Internflare Gateway Service

The gateway provides one HTTP entry point for backend APIs. It owns the public `/api/v1` prefix, routes each request to the owning service, and strips that prefix upstream. Query strings, headers, cookies, and response bodies are preserved.

## Routes

- `GET /health` returns the gateway's own liveness status.
- `/api/v1/opportunities/*` is forwarded to jobListing-service.
- `/api/v1/notifications/*` is forwarded to notification-service.
- `/api/v1/auth/*`, `/api/v1/admin/*`, and `/api/v1/internal/*` are forwarded to profile-service.
- `/api/v1/talent/*` is also forwarded to profile-service.
- `/api/v1/me`, `/api/v1/health`, and `/api/auth/*` are forwarded to auth-service. Better Auth's `/api/auth/*` paths pass through unchanged.
- Other paths are forwarded to auth-service as a fallback.

The gateway listens on port `3000`. Set `AUTH_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `JOB_LISTING_SERVICE_URL`, and `PROFILE_SERVICE_URL` to the HTTP(S) origins of the upstream services; they default to `http://localhost:3001`, `http://localhost:3002`, `http://localhost:3003`, and `http://localhost:3004` for local development.

Gateway Swagger UI: `GET /docs`. Gateway OpenAPI JSON: `GET /openapi.json`. This unified document describes the public gateway endpoints, request parameters, payloads, and authentication mechanisms. Upstream services expose their internal, unversioned API documentation at their own `/docs` and `/openapi.json` paths.

In Docker Compose, the gateway waits until all four upstream services are healthy before starting. On startup it probes each service's `/health` endpoint and logs a one-time healthy, unhealthy, or unavailable status; this is a startup snapshot, not continuous monitoring.

## Run locally

```powershell
npm install
npm run dev
```

Start the upstream services before sending requests through the gateway. In Docker Compose, the gateway uses service names on the Compose network and waits for the upstream services to pass their health checks.
