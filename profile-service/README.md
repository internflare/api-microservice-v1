# Internflare Company Service (`profile-service`)

Standalone microservice managing Company Creation, Member Management, Verification Lifecycle, and Audit Trails for the Internflare platform (PRD §4.2, §4.3, §14; Employer Journey steps 33–34).

---

## Features

- **Company Management:** Atomic creation with creator designated as `ADMIN`, profile retrieval, and partial updates with audit trail.
- **Team & Member Management:** Member invitations, acceptance, role assignment (`ADMIN` / `MEMBER`), and **non-destructive soft removal** (`status = 'REMOVED'`, PRD §14) with protection preventing removal of the sole company administrator.
- **Verification Submissions & Admin Decisions:** Document uploads, platform administrator review inbox, state machine (`UNVERIFIED` -> `PENDING_REVIEW` -> `VERIFIED` / `REJECTED`), and feature gating (`requireCompanyVerified`).
- **Audit Ledger:** Append-only relational audit trail (`audit_logs`) tracking actor ID, action name, payload metadata, and client IP.
- **Internal Cross-Service RPC:** Protected endpoints (`x-internal-service-key`) for downstream microservices (`job-service`, `workspace-service`, `billing-service`) to inspect company verification status and member permissions.
- **Decoupled Auth Handshake:** Remote session validation against `auth-service` (`/api/auth/get-session`) with mock user support for automated testing.

The company service listens on unversioned internal routes (for example, `/auth/employer-onboarding`). Public requests should use the gateway's versioned route, such as `POST http://localhost:3000/api/v1/auth/employer-onboarding`; the gateway strips `/api/v1` before forwarding.

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
│   │       └── 001_create_company_tables.sql
│   ├── types/
│   │   ├── express.d.ts                   # Express Request augmentation
│   │   └── company.types.ts               # Domain interfaces & contracts
│   ├── validators/
│   │   └── company.validator.ts           # Zod request validation schemas
│   ├── middleware/
│   │   ├── auth.ts                        # Remote session introspection & admin RBAC
│   │   ├── company-auth.ts                # Company membership & verification guards
│   │   ├── internal-auth.ts               # Shared-secret service-to-service guard
│   │   └── validate.ts                    # Generic Zod validation middleware
│   ├── models/
│   │   └── company.model.ts               # Atomic transactions & DB operations
│   ├── controllers/
│   │   ├── company.controller.ts          # Public company & member endpoints
│   │   ├── admin.controller.ts            # Platform admin verification review
│   │   └── internal.controller.ts         # Downstream microservice RPC endpoints
│   └── routes/
│       ├── company.routes.ts
│       ├── admin.routes.ts
│       └── internal.routes.ts
├── tests/
│   ├── setup.ts                           # Test environment initializers
│   └── company.test.ts                    # Consolidated test suite across all 5 phases (65 tests)
├── Dockerfile                             # Multi-stage non-root container build
├── tsconfig.json                          # Base TypeScript configuration
├── tsconfig.build.json                    # Production build configuration
└── package.json
```

---

## Getting Started

The service automatically runs its database migrations before opening the HTTP listener. Ensure `DATABASE_URL` points to the intended database and that the database user can create the company schema.

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
CORS_ORIGIN=*
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

Executes all 65 automated tests across 5 phase test suites.

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
