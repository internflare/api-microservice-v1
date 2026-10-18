# Phase 5: Cross-Service Integration & Technical Handover — Documentation

## 1. Executive Summary
This document provides formal architectural documentation for **Phase 5** of the Internflare Company & Member Management subsystem (PRD §4.2, §4.3, §14; Employer Journey steps 33–34).

Phase 5 establishes the internal, service-to-service communication contracts that link `auth-service` with downstream microservices across the Internflare ecosystem (`job-service`, `workspace-service`, `billing-service`). It provides high-speed, secure permission inspection endpoints, token-guarded RPC routes, and complete operational handover runbooks.

---

## 2. What Was Built

### 2.1 Internal Shared-Secret Authentication (`src/middleware/internal-auth.ts`)
* Implemented `requireInternalServiceAuth`:
  * Validates the `x-internal-service-key` request header against `config.internalServiceSecret`.
  * Protects internal inspection endpoints from public browser traffic and unauthorized callers.
  * Rejects missing or mismatched keys immediately with HTTP `401 Unauthorized`.

### 2.2 Cross-Service Access & Membership Inspector (`src/controllers/internal.controller.ts`)
* **Endpoint:** `GET /api/internal/companies/:id/access/:userId`
  * Validated by Zod `accessParamSchema` (UUID format for company ID, non-empty user ID).
  * Returns atomic, consolidated access evaluation for any requested user:
    * Organization verification state (`is_verified: boolean`, `verification_status: string`).
    * Active membership status (`has_access: boolean`, `status: ACTIVE | INVITED | REMOVED`).
    * Workspace role (`workspace_role: ADMIN | MEMBER`).
  * **PRD §14 Strict Compliance:** Automatically evaluates `has_access: false` if a member was soft-removed (`status === 'REMOVED'`), instantly cutting off downstream access without database deletion cascades.

### 2.3 Lightweight Verification Status Endpoint (`src/controllers/internal.controller.ts`)
* **Endpoint:** `GET /api/internal/companies/:id/verification`
  * High-speed status check designed for feature-gating checks (e.g. before `job-service` publishes live job postings or `billing-service` executes escrow payouts per PRD §4.2).

### 2.4 Internal Routing Pipeline (`src/routes/internal.routes.ts`)
* Mounted at `/api/internal` in [`src/app.ts`](file:///c:/Users/testy/api-microservice-v1/auth-service/src/app.ts).
* Entire router is pre-guarded with `requireInternalServiceAuth`.

---

## 3. Cross-Service Integration Guide for Downstream Services

### 3.1 Architecture Overview

```
                      Internflare Microservice Architecture
                      ────────────────────────────────────

               [ Client / Browser Request ]
                            │
                            ▼
               ┌─────────────────────────┐
               │   Downstream Service    │
               │ (job-service / billing) │
               └────────────┬────────────┘
                            │
               Internal RPC │ Header: x-internal-service-key
               HTTP Request │
                            ▼
               ┌─────────────────────────┐
               │      auth-service       │
               │   (/api/internal/...)   │
               └────────────┬────────────┘
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
          [ companies ]       [ company_members ]
         (Checks status)     (Enforces PRD §14)
```

### 3.2 Downstream Service Integration Examples

#### Example 1: `job-service` Feature-Gating (PRD §4.2)
Before publishing a job listing, `job-service` validates that the company is verified:

```typescript
// Example: job-service/src/guards/company-verification.ts
async function assertCompanyCanPublishJob(companyId: string): Promise<void> {
  const response = await fetch(
    `${process.env.AUTH_SERVICE_URL}/api/internal/companies/${companyId}/verification`,
    {
      headers: {
        "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET!,
      },
    }
  );

  if (!response.ok) {
    throw new Error("Unable to verify company status");
  }

  const data = await response.json();
  if (!data.is_verified) {
    throw new Error(`Company cannot publish jobs. Verification status is ${data.verification_status}`);
  }
}
```

#### Example 2: `workspace-service` Member Authorization (PRD §14)
Before allowing a user to modify workspace boards or project documents:

```typescript
// Example: workspace-service/src/middleware/check-access.ts
async function checkMemberAccess(companyId: string, userId: string): Promise<boolean> {
  const response = await fetch(
    `${process.env.AUTH_SERVICE_URL}/api/internal/companies/${companyId}/access/${userId}`,
    {
      headers: {
        "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET!,
      },
    }
  );

  if (!response.ok) return false;

  const { has_access, membership } = await response.json();
  // Returns false if user was soft-removed or never joined
  return has_access === true && membership?.status === "ACTIVE";
}
```

---

## 4. Master API Reference Matrix (Complete System)

### 4.1 Authentication & Profile
| Method | Endpoint | Access / Guard | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/sign-up/email` | Public | Better Auth email registration |
| `POST` | `/api/auth/sign-in/email` | Public | Better Auth email login |
| `POST` | `/api/auth/sign-out` | Authenticated | Session revocation |
| `GET` | `/api/auth/get-session` | Public | Inspect session cookie |
| `GET` | `/api/me` | `requireAuth` | Current user & session payload |
| `GET` | `/api/health` | Public | Database & service health check |

### 4.2 Company Management (Phase 1–3)
| Method | Endpoint | Access / Guard | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/companies` | `requireAuth` | Atomically creates company & assigns creator as `ADMIN` |
| `GET` | `/api/companies/:id` | `requireCompanyMember` | Retrieves active company profile |
| `PATCH` | `/api/companies/:id` | `requireCompanyRole(["ADMIN"])` | Updates profile fields dynamically with audit logging |

### 4.3 Member Management (Phase 2–3)
| Method | Endpoint | Access / Guard | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/companies/:id/members/invite` | `requireCompanyRole(["ADMIN"])` | Invites member with role `ADMIN` or `MEMBER` |
| `GET` | `/api/companies/:id/members` | `requireCompanyMember` | Lists all team members and statuses |
| `POST` | `/api/companies/:id/members/accept` | `requireAuth` | User claims pending invitation (`ACTIVE`) |
| `DELETE` | `/api/companies/:id/members/:memberId` | `requireCompanyRole(["ADMIN"])` | Non-destructive soft removal (`REMOVED`), blocks sole admin removal |

### 4.4 Verification & Admin Workflow (Phase 4)
| Method | Endpoint | Access / Guard | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/companies/:id/verifications` | `requireCompanyRole(["ADMIN"])` | Employer submits documents; status becomes `PENDING_REVIEW` |
| `GET` | `/api/companies/:id/verifications` | `requireCompanyMember` | History of verification attempts and notes |
| `GET` | `/api/admin/verifications` | `requirePlatformAdmin` | Platform admin pending verification inbox |
| `POST` | `/api/admin/verifications/:id/decision` | `requirePlatformAdmin` | Approves or rejects request; emits audit log |

### 4.5 Internal Cross-Service API (Phase 5)
| Method | Endpoint | Access / Guard | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/internal/companies/:id/access/:userId` | `requireInternalServiceAuth` | Consolidated membership, role, and verification check |
| `GET` | `/api/internal/companies/:id/verification` | `requireInternalServiceAuth` | Quick verification boolean check for feature gating |

---

## 5. Master Test Suite Verification

Run the entire test suite:
```sh
npm test
```

### Complete Test Results Breakdown
* **`tests/phase1.test.ts` (9 tests):** Zod schemas, URL params, country codes, validation middleware.
* **`tests/phase2.test.ts` (12 tests):** Session auth, company isolation, soft-removed access revocation, role privilege guards.
* **`tests/phase3.test.ts` (13 tests):** Atomic company creation, profile CRUD, member invitations, acceptance, sole-admin protection.
* **`tests/phase4.test.ts` (18 tests):** Employer verification submissions, platform admin reviews, decision state sync, conflict prevention, feature gating.
* **`tests/phase5.test.ts` (9 tests):** Internal shared key validation, cross-service permission checks, removed member access denials, verification boolean status.

**Total passing test cases: 65 of 65 across 5 test suites (100% pass rate, 0 failures).**

---

## 6. Operational & Deployment Runbook

### 6.1 Environment Configuration
Ensure `.env` contains all required variables:
```sh
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/dbname
BETTER_AUTH_SECRET=a-secure-random-secret-at-least-32-chars
BETTER_AUTH_URL=https://auth.internflare.com
CORS_ORIGINS=https://app.internflare.com
INTERNAL_SERVICE_SECRET=a-secure-internal-secret-at-least-32-chars
```

### 6.2 Database Migration Runbook
1. Run Better Auth migrations:
   ```sh
   npm run auth:migrate
   ```
2. Run Company & Member relational migrations:
   ```sh
   npm run db:migrate
   ```

### 6.3 Building & Running in Production
```sh
# 1. Install dependencies
npm ci

# 2. Compile TypeScript
npm run build

# 3. Start service
npm start
```
