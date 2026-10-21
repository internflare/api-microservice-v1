# Internflare Auth & Organization Service

Standalone ESM Node.js/TypeScript authentication and organization management microservice using Express v5, Better Auth, and PostgreSQL.

This microservice implements the **Company Creation, Member Management, and Verification Audit Subsystem** for the Internflare platform (PRD §4.2, §4.3, §14; Employer Journey steps 33–34).

```text
src/
  controllers/  Express MVC request handlers
  db/           PostgreSQL migrations and transactional runner
  middleware/   Authentication, RBAC, Zod validation, and error guards
  models/       PostgreSQL database models with audit log emission
  routes/       API route definitions
  types/        TypeScript domain interfaces and Express type augmentation
  validators/   Runtime Zod input and parameter validation schemas
  app.ts        Express application wiring and security middleware
  auth.ts       Better Auth engine and PostgreSQL connection pool
  config.ts     Validated environment configuration
  server.ts     HTTP server lifecycle
docs/           Formal phase-by-phase architectural documentation
tests/          Automated test suite (65 passing unit & integration tests)
```

---

## Requirements

- **Node.js** 20.11 or later
- **PostgreSQL** 14 or later

---

## Setup & Configuration

```sh
# 1. Install dependencies
npm install

# 2. Configure environment
Copy-Item .env.example .env
```

Ensure your `.env` contains:
```ini
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://username:password@localhost:5432/internflare
BETTER_AUTH_SECRET=a-secure-random-secret-at-least-32-chars
BETTER_AUTH_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:5173
INTERNAL_SERVICE_SECRET=a-secure-internal-secret-at-least-32-chars
```

---

## Database Migrations

Run migrations in sequence to set up both authentication and relational organization tables:
Set `DATABASE_URL` to a reachable PostgreSQL database and place its CA certificate at `backend/ca.pem`, shared by backend services. The service uses that certificate with `sslmode=verify-full` to validate both the database certificate and hostname. Replace `BETTER_AUTH_SECRET` with a cryptographically random secret of at least 32 characters. `BETTER_AUTH_URL` is the public base URL of this service; `CORS_ORIGINS` is a comma-separated list of frontend origins allowed to make credentialed requests.

Set `RABBITMQ_URL` to the RabbitMQ broker used by `backend/notification-service`. After Better Auth successfully creates a user record, auth-service publishes a persistent `user.signed_up` message to the shared `internflare.notifications` queue. Signup remains successful if the broker is unavailable; the publish failure is logged, and that event will not produce a welcome email.
Email/password accounts must verify their address before Better Auth creates a login session. After sign-up (and on subsequent sign-in attempts while unverified), auth-service publishes a verification email event to the same queue. Notification-service emails a button linking to Better Auth's one-time verification URL. After the user clicks it, Better Auth verifies the address and redirects to the sign-up `callbackURL` so onboarding can continue. Configure notification-service and RabbitMQ normally; email delivery failures are retried by the durable consumer.

Set `SENTRY_DSN` to this service's Sentry Node project DSN to enable error and performance reporting. `SENTRY_TRACES_SAMPLE_RATE` optionally controls transaction sampling (default `0.1`). See the workspace [Sentry setup](../../SENTRY.md).

The service's internal OpenAPI JSON is available at `GET /openapi.json`; its interactive Swagger UI is at `GET /docs`. Public API requests use the gateway's `/api/v1` prefix.

The Docker container ensures PostgreSQL's default `public` schema exists, then
applies Better Auth's database migrations before starting the service. This
initializes the authentication tables when the database is empty and safely
applies schema updates on later starts. The auth-service database user must
have permission to create the schema and tables and alter existing tables.

For local development, run the Better Auth migration command before starting
the service:

```sh
npm run auth:migrate
```

The profile-service applies its own organization and talent-profile migrations
automatically at startup.

Better Auth persists application login sessions, including their session token
and expiry, in its `session` table. OAuth access, refresh, and ID tokens from
social sign-ins are stored on the linked provider account in the `account`
table; OAuth tokens are encrypted at rest using `BETTER_AUTH_SECRET`. Email and
password sign-ins use Better Auth sessions and do not issue a separate
application access-token/refresh-token pair. Keep the auth secret stable and
back it up securely, because changing it prevents existing OAuth tokens from
being decrypted.

---

## Running & Testing

```sh
# Run development server with live reload
npm run dev

# Run automated test suite (all 5 phases)
npm test

# Production build and run
npm run build
npm start
```

---

## API Overview

### 1. Authentication (`/api/auth`)
* `POST /api/auth/sign-up/email` — Email registration.
* `POST /api/auth/sign-in/email` — Email login.
* `POST /api/auth/sign-out` — Session revocation.
* `GET /api/auth/get-session` — Session inspection.
* `GET /api/me` — Current user context.
* `GET /api/health` — Database and server health status.

### 2. Company Lifecycle (`/api/companies`)
* `POST /api/companies` — Creates company profile and assigns creator as active `ADMIN`.
* `GET /api/companies/:id` — Retrieves active company profile details.
* `PATCH /api/companies/:id` — Updates company profile (restricted to `ADMIN`).

### 3. Member Management (`/api/companies/:id/members`)
* `POST /api/companies/:id/members/invite` — Invites user with `ADMIN` or `MEMBER` role.
* `GET /api/companies/:id/members` — Lists team members and statuses.
* `POST /api/companies/:id/members/accept` — Authenticated user accepts invitation (`ACTIVE`).
* `DELETE /api/companies/:id/members/:memberId` — Non-destructive soft removal (`REMOVED`), revokes access while preserving records (PRD §14). Prevents sole admin removal.

### 4. Verification & Administration (`/api/companies/:id/verifications`, `/api/admin/verifications`)
* `POST /api/companies/:id/verifications` — Employer submits verification documents (`PENDING_REVIEW`).
* `GET /api/companies/:id/verifications` — History of verification submissions.
* `GET /api/admin/verifications` — Platform admin review inbox.
* `POST /api/admin/verifications/:id/decision` — Platform admin approval or rejection with audit logging.

### 5. Internal Cross-Service API (`/api/internal`)
*Protected by `x-internal-service-key` header.*
* `GET /api/internal/companies/:id/access/:userId` — Checks membership role, status, and verification state.
* `GET /api/internal/companies/:id/verification` — Checks verification status for downstream feature gating.

---

## Architectural Documentation

Full architectural specifications, database design rationale, and test matrices are available in [`docs/`](docs):
* [Phase 1: Foundation, Migration & Contracts](docs/phase1-foundation-and-contracts.md)
* [Phase 2: Authentication & Authorization Guards](docs/phase2-auth-and-guards.md)
* [Phase 3: Company & Member Business Logic & Lifecycles](docs/phase3-business-logic-and-lifecycles.md)
* [Phase 4: Verification Submissions, Admin Decisions & Audit Trail](docs/phase4-verification-and-audit.md)
* [Phase 5: Cross-Service Integration & Technical Handover](docs/phase5-integration-and-handover.md)
