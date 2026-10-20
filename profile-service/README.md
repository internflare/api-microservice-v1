# Internflare Profile Service (`profile-service`)

Microservice managing company and talent profiles, company membership and verification, talent profile completeness, and candidate discovery.

---

## Features

- **Company Management:** Atomic creation with creator designated as `ADMIN`, profile retrieval, and partial updates with audit trail.
- **Team & Member Management:** Member invitations, acceptance, role assignment (`ADMIN` / `MEMBER`), and **non-destructive soft removal** (`status = 'REMOVED'`, PRD §14) with protection preventing removal of the sole company administrator.
- **Verification Submissions & Admin Decisions:** Document uploads, platform administrator review inbox, state machine (`UNVERIFIED` -> `PENDING_REVIEW` -> `VERIFIED` / `REJECTED`), and feature gating (`requireCompanyVerified`).
- **Audit Ledger:** Append-only relational audit trail (`audit_logs`) tracking actor ID, action name, payload metadata, and client IP.
- **Internal Cross-Service RPC:** Protected endpoints (`x-internal-service-key`) for downstream microservices (`job-service`, `workspace-service`, `billing-service`) to inspect company verification status and member permissions.
- **Decoupled Auth Handshake:** Remote session validation against `auth-service` (`/api/auth/get-session`) with mock user support for automated testing.
- **Talent Profiles:** Authenticated profile creation and updates, completeness scoring, and public candidate search.

The service listens on unversioned internal routes (for example, `/auth/employer-onboarding` and `/talent/profile`). Public requests use the gateway's versioned routes, such as `POST http://localhost:3000/api/v1/auth/employer-onboarding` and `GET http://localhost:3000/api/v1/talent/profile/me`; the gateway strips `/api/v1` before forwarding. Talent endpoints retain `/api/talent/*` as a compatibility alias.

---

## Tech Stack

- **Runtime:** Node.js (v22+, ES Modules)
- **Language:** TypeScript 5.8
- **Framework:** Express 4.21
- **Database:** PostgreSQL (`pg` pool with SSL support)
- **Validation:** Zod 3.24
- **Testing:** Native `node:test` + `tsx` (65 passing unit and integration tests)

---

## Directory Structure

```
profile-service/
├── src/
│   ├── config.ts                          # Validated environment configuration
│   ├── app.ts                             # Express application & router mounting
│   ├── server.ts                          # Server bootstrap & graceful shutdown
│   ├── db/
│   │   ├── pool.ts                        # PostgreSQL connection pool
│   │   ├── migrate.ts                     # Database migration runner
│   │   └── migrations/
│   │       ├── 001_create_company_tables.sql
│   │       └── 001_create_talent_profiles.sql
│   ├── types/
│   │   ├── express.d.ts                   # Express Request augmentation
│   │   ├── company.types.ts               # Company domain contracts
│   │   └── talent.types.ts                # Talent profile contracts
│   ├── validators/
│   │   ├── company.validator.ts           # Company request validation
│   │   └── talent.validator.ts            # Talent profile and search validation
│   ├── middleware/
│   │   ├── auth.ts                        # Remote session introspection & admin RBAC
│   │   ├── company-auth.ts                # Company membership & verification guards
│   │   ├── internal-auth.ts               # Shared-secret service-to-service guard
│   │   └── validate.ts                    # Generic Zod validation middleware
│   ├── services/
│   │   └── completeness.service.ts        # Talent profile completeness scoring
│   ├── models/
│   │   ├── company.model.ts               # Atomic transactions & DB operations
│   │   └── talent.model.ts                # Talent persistence and search
│   ├── controllers/
│   │   ├── company.controller.ts          # Public company & member endpoints
│   │   ├── admin.controller.ts            # Platform admin verification review
│   │   ├── internal.controller.ts         # Downstream microservice RPC endpoints
│   │   └── talent.controller.ts           # Talent profile and discovery endpoints
│   ├── routes/
│       ├── company.routes.ts
│       ├── admin.routes.ts
│       ├── internal.routes.ts
│       └── talent.routes.ts
│   └── docs/
│   │   └── openapi.ts                     # Talent OpenAPI document
├── tests/
│   ├── setup.ts                           # Test environment initializers
│   ├── company.test.ts                    # Company service tests
│   └── talent.test.ts                     # Talent profile tests
├── Dockerfile                             # Multi-stage non-root container build
├── tsconfig.json                          # Base TypeScript configuration
├── tsconfig.build.json                    # Production build configuration
└── package.json
```

---

## Getting Started

The service automatically runs both company and talent database migrations before opening the HTTP listener. Both features use the profile service's `DATABASE_URL`; ensure it points to the intended database and that the database user can create the required tables and indexes. The migration creates the talent schema but does not copy rows from a separate talent-service database. If the old service used another database, export/import its data before switching to the combined service.

The gateway's unified Swagger UI is available at `http://localhost:3000/docs`. Profile-service also serves its talent OpenAPI document at `/openapi.json` and Swagger UI at `/docs` when accessed directly.

### 1. Environment Configuration

Copy `.env.example` to `.env`:

```sh
cp .env.example .env
```

Ensure the following variables are configured:

```env
PORT=3004
DATABASE_URL=postgresql://user:password@host:5432/internflare
DATABASE_SSL=false
AUTH_SERVICE_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
INTERNAL_SERVICE_SECRET=your-internal-shared-secret-at-least-32-chars
```

When PostgreSQL requires TLS, set `DATABASE_SSL=true`. The service verifies the database certificate against the shared CA at `backend/ca.pem`; a TLS-enabled `sslmode` in `DATABASE_URL` also enables verification.

### 2. Install Dependencies

```sh
npm install
```

### 3. Run Database Migrations

```sh
npm run db:migrate
```

### 4. Run Development Server

```sh
npm run dev
```

The service will start on `http://localhost:3004`.

---

## Testing & Build

### Run Test Suite

```sh
npm test
```

Runs the company and talent profile test suites.

### Type Check & Build

```sh
npm run type-check
npm run build
```

---

## Docker

Build the container image:

```sh
docker build -t internflare-profile-service .
```

Run the container:

```sh
docker run -p 3004:3004 --env-file .env internflare-profile-service
```
