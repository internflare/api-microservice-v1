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

Set `RABBITMQ_URL` to the RabbitMQ broker used by `backend/notification-service`. After Better Auth successfully creates a user record, auth-service publishes a persistent `user.signed_up` message to `RABBITMQ_NOTIFICATION_QUEUE` (default `internflare.notifications.email`). Signup remains successful if the broker is unavailable; the publish failure is logged, and that event will not produce a welcome email.

Set `SENTRY_DSN` to this service's Sentry Node project DSN to enable error and performance reporting. `SENTRY_TRACES_SAMPLE_RATE` optionally controls transaction sampling (default `0.1`). See the workspace [Sentry setup](../../SENTRY.md).

Create Better Auth's database tables and start the service:

```sh
# 1. Better Auth session tables
npm run auth:migrate

# 2. Internflare organization tables (companies, members, verifications, audit logs)
npm run db:migrate
```

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
