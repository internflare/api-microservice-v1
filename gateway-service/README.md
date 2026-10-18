# Internflare Gateway Service

The gateway provides one HTTP entry point for the auth and notification services. It forwards requests to the selected service without changing the existing API paths, query strings, headers, cookies, or response bodies.

## Routes

- `GET /health` returns the gateway's own liveness status.
- `/api/v1/opportunities` is forwarded to jobListing-service.
- `/api/v1/notifications`, `/api/v1/docs`, and `/api/v1/openapi.json` are forwarded to notification-service.
- Other paths, including `/api/auth/*` and `/api/v1/me`, are forwarded to auth-service.

The gateway listens on port `3000`. Set `AUTH_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, and `JOB_LISTING_SERVICE_URL` to the HTTP(S) origins of the upstream services; they default to `http://localhost:3001`, `http://localhost:3002`, and `http://localhost:3003` for local development.

## Run locally

```powershell
npm install
npm run dev
```

Start auth-service and notification-service before sending requests through the gateway. In Docker Compose, the gateway uses the service names on the Compose network and waits for both services to pass their health checks.
