# Phase 2: Authentication & Authorization Guards — Documentation

## 1. Executive Summary
This document provides formal architectural documentation for **Phase 2** of the Internflare Company & Member Management subsystem (PRD §4.2, §4.3, §14; Employer Journey steps 33–34).

Phase 2 establishes the multi-layer security guard pipeline for company access control. It integrates Better Auth session validation, enforces company workspace boundaries, guarantees immediate access revocation for removed members while retaining historical data (PRD §14), and enforces strict Role-Based Access Control (RBAC) across administrative endpoints.

---

## 2. What Was Built

### 2.1 Authentication & Session Guard (`src/middleware/auth.ts`)
* Implemented `requireAuth`:
  * Integrates with Better Auth via `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`.
  * Extracts authenticated user context and attaches it to `req.user` (`id`, `email`, `name`, `role`).
  * Rejects unauthenticated requests with standardized HTTP `401 Unauthorized` (`{ error: "Unauthorized", message: "Authentication required" }`).
  * Supports deterministic automated testing via controlled test headers (`x-test-user-id`, `x-test-user-email`, `x-test-user-role`) in `NODE_ENV === "test"`.

### 2.2 Company Boundary & Membership Guard (`src/middleware/company-auth.ts`)
* Implemented `requireCompanyMember`:
  * Extracts the target company UUID from `req.params.id`.
  * Queries database membership via `CompanyModel.findMember(companyId, userId)`.
  * **Non-Member Guard:** If no record exists, rejects with HTTP `403 Forbidden` (`"You are not a member of this company"`).
  * **Access Revocation Guard (PRD §14):** If member status is `REMOVED`, immediately terminates request with HTTP `403 Forbidden` (`"Access revoked. Your membership in this company has been removed."`).
  * **Pending Invite Guard:** If member status is `INVITED`, rejects access with HTTP `403 Forbidden` (`"Membership invitation is pending acceptance."`) until the user explicitly accepts their invitation.
  * **Context Attachment:** On `ACTIVE` status, attaches full member record to `req.companyMember` for downstream handlers.

### 2.3 Role Privilege Enforcement Guard (`src/middleware/company-auth.ts`)
* Implemented `requireCompanyRole(allowedRoles: CompanyMemberRole[])`:
  * Configurable higher-order middleware validating workspace roles (`ADMIN` vs `MEMBER`).
  * Validates that `req.companyMember.workspace_role` is included in `allowedRoles`.
  * If unauthorized, rejects with HTTP `403 Forbidden` (`"Action requires one of the following roles: [allowedRoles]"`).
  * Applied across sensitive routes (e.g., updating company profile, inviting members, soft-removing members, submitting verification documents).

### 2.4 Express Type Augmentation (`src/types/company.types.ts`)
* Extended Express global `Request` interface with strict typing:
  * `req.user`: Contains authenticated session user (`id`, `email`, `role`, etc.).
  * `req.companyMember`: Contains active company membership record (`id`, `company_id`, `user_id`, `workspace_role`, `status`).

### 2.5 Automated Test Suite (`tests/phase2.test.ts`)
* Built 12 comprehensive unit and guard tests using Node.js native test runner (`tsx --test`):
  * Unauthenticated rejection (`401 Unauthorized`).
  * Authenticated session context attachment.
  * Non-member rejection (`403 Forbidden`).
  * Soft-removed member rejection (`403 Forbidden` — PRD §14 compliance).
  * Pending invitation rejection (`403 Forbidden`).
  * Active member acceptance and `req.companyMember` population.
  * Role restriction blocking regular `MEMBER` from administrative routes.
  * Role restriction allowing `ADMIN` users through.

---

## 3. How It Works (Security Guard Pipeline)

All incoming requests to `/api/companies/:id/*` flow through a deterministic, fail-fast security pipeline:

```
Incoming HTTP Request
       │
       ▼
[ Layer 1: requireAuth ]
  ├── No Session ───────► 401 Unauthorized
  └── Valid Session ────► Attaches req.user
       │
       ▼
[ Layer 2: validateParams / validateBody ] (Zod)
  ├── Invalid UUID/Body ► 400 Bad Request
  └── Valid Payload ────► Sanitized parameters passed forward
       │
       ▼
[ Layer 3: requireCompanyMember ]
  ├── No Membership ────► 403 Forbidden ("Not a member")
  ├── Status: REMOVED ──► 403 Forbidden ("Access revoked" - PRD §14)
  ├── Status: INVITED ──► 403 Forbidden ("Invitation pending")
  └── Status: ACTIVE ───► Attaches req.companyMember
       │
       ▼
[ Layer 4: requireCompanyRole(["ADMIN"]) ] (Administrative Routes)
  ├── Role: MEMBER ─────► 403 Forbidden ("Requires ADMIN role")
  └── Role: ADMIN ──────► Authorized
       │
       ▼
[ Layer 5: Route Controller Handler ]
  └── Executes business logic within audited transaction
```

---

## 4. Why It Was Built This Way (PRD Rationale & Security Architecture)

### 4.1 Strict Access Revocation Without Data Deletion (PRD §14 & Acceptance Criteria #19)
* **PRD Requirement:** *"Removing a member revokes access without deleting company-owned project records."*
* **Architectural Decision:** Rather than hard deleting membership records or relying on client-side state, revocation is enforced centrally in the `requireCompanyMember` gateway middleware. As soon as `status` is set to `REMOVED`, all company endpoints immediately deny access with `403 Forbidden`. The underlying database row retains the original `joined_at`, `removed_at`, and historical audit records intact.

### 4.2 Fail-Fast, Least-Privilege Role Gating (PRD §4.2)
* **PRD Requirement:** *"Employer Journey 33–34: Organization settings, team invites, and verification decisions must be restricted to authorized workspace administrators."*
* **Architectural Decision:** Separating `requireCompanyMember` (boundary verification) from `requireCompanyRole` (privilege verification) keeps middlewares single-purpose, composable, and reusable. Non-administrative endpoints (like reading company profile or listing team members) only require membership, whereas mutating endpoints require the explicit `ADMIN` role.

### 4.3 Defense-in-Depth Authentication
* **Architectural Decision:** The global router mounts `requireAuth` at the root of `companyRoutes` (`companyRoutes.use(requireAuth)`). No company route can ever be accidentally exposed to anonymous public traffic, even if an individual route definition omits a guard.

---

## 5. Test Suite Verification Summary

Run the test suite using:
```sh
npm test
```

### Test Results Matrix (`tests/phase2.test.ts`)
| Test Case | Guard Under Test | Expected Behavior | Result |
| :--- | :--- | :--- | :---: |
| `requireAuth blocks unauthenticated requests` | `requireAuth` | Returns `401 Unauthorized` | **PASS** |
| `requireAuth attaches user from session/header` | `requireAuth` | Attaches `req.user`, calls `next()` | **PASS** |
| `requireCompanyMember blocks non-members` | `requireCompanyMember` | Returns `403 Forbidden` | **PASS** |
| `requireCompanyMember blocks REMOVED members` | `requireCompanyMember` | Returns `403 Forbidden` (PRD §14) | **PASS** |
| `requireCompanyMember blocks INVITED members` | `requireCompanyMember` | Returns `403 Forbidden` | **PASS** |
| `requireCompanyMember allows ACTIVE members` | `requireCompanyMember` | Attaches `req.companyMember`, calls `next()` | **PASS** |
| `requireCompanyRole blocks MEMBER from ADMIN routes` | `requireCompanyRole` | Returns `403 Forbidden` | **PASS** |
| `requireCompanyRole allows ADMIN role` | `requireCompanyRole` | Calls `next()` | **PASS** |

**Total Suite Status:** 21 of 21 tests passing across `phase1.test.ts` and `phase2.test.ts`.

---

## 6. Phase 2 Completion Checklist
- [x] Session authentication guard (`requireAuth`)
- [x] Company boundary isolation guard (`requireCompanyMember`)
- [x] Soft-removed member access revocation (PRD §14)
- [x] Workspace role privilege enforcement (`requireCompanyRole`)
- [x] Comprehensive automated test coverage (12/12 passing)
- [x] Formal Phase 2 architecture documentation
