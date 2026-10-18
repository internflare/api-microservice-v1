# Internflare Auth Service

Standalone ESM Node.js/TypeScript authentication service using Express, Better Auth, and PostgreSQL.

The Express application follows MVC separation: route modules map URLs to controllers, controllers coordinate request handling, and models encapsulate session and database access. Better Auth supplies the authentication implementation and PostgreSQL-backed auth data.

```text
src/
  controllers/  Request handlers
  middleware/   Shared error and 404 handlers
  models/       Session and database access
  routes/       API route definitions
  app.ts        Express app and middleware wiring
  auth.ts       Better Auth and PostgreSQL pool
  config.ts     Validated environment configuration
  server.ts     HTTP server lifecycle
```

## Requirements

- Node.js 20.11 or later
- PostgreSQL

## Setup

```sh
npm install
Copy-Item .env.example .env
```

Set `DATABASE_URL` to a reachable PostgreSQL database and place its CA certificate at `backend/ca.pem`, shared by backend services. The service uses that certificate with `sslmode=verify-full` to validate both the database certificate and hostname. Replace `BETTER_AUTH_SECRET` with a cryptographically random secret of at least 32 characters. `BETTER_AUTH_URL` is the public base URL of this service; `CORS_ORIGINS` is a comma-separated list of frontend origins allowed to make credentialed requests.

Set `RABBITMQ_URL` to the RabbitMQ broker used by `backend/notification-service`. After Better Auth successfully creates a user record, auth-service publishes a persistent `user.signed_up` message to the shared `internflare.notifications` queue. Signup remains successful if the broker is unavailable; the publish failure is logged, and that event will not produce a welcome email.

Set `SENTRY_DSN` to this service's Sentry Node project DSN to enable error and performance reporting. `SENTRY_TRACES_SAMPLE_RATE` optionally controls transaction sampling (default `0.1`). See the workspace [Sentry setup](../../SENTRY.md).

Create Better Auth's database tables and start the service:

```sh
npm run auth:migrate
npm run dev
```

For a production build, use `npm run build` followed by `npm start`.

## Authentication API

Better Auth's handler is mounted at `/api/auth`. Its email/password endpoints include:

- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-out`
- `GET /api/auth/get-session`

The browser should send requests with credentials enabled so its session cookie is included. `GET /api/me` returns the current user and session, or `401` if the request is unauthenticated. `GET /api/health` checks both the HTTP service and its PostgreSQL connection.
