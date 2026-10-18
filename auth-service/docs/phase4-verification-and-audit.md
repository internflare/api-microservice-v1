# Phase 4: Verification Submissions, Admin Decisions & Audit Trail — Documentation

## 1. Executive Summary
This document provides formal architectural documentation for **Phase 4** of the Internflare Company & Member Management subsystem (PRD §4.2, §4.3, §14; Employer Journey steps 33–34).

Phase 4 establishes the organizational trust and verification lifecycle. It enables employers to submit official incorporation and identity documents, provides a secure platform administration inbox for reviewing and deciding submissions, maintains an immutable ledger of all verification actions in `audit_logs`, and supplies reusable feature-gating middleware (`requireCompanyVerified`) to protect sensitive platform operations from unverified entities.

---

## 2. What Was Built

### 2.1 Employer Verification Submission Workflow (`src/controllers/company.controller.ts`)
* **Endpoint (`POST /api/companies/:id/verifications`):**
  * Gated to authenticated company administrators (`requireAuth`, `requireCompanyMember`, `requireCompanyRole(["ADMIN"])`).
  * Validated by `submitVerificationSchema` (requires at least one valid document with title and URL).
  * Executes an atomic database transaction via `CompanyModel.submitVerification`:
    1. Validates that the company exists and is active (`deleted_at IS NULL`).
    2. Inserts a new record into `company_verifications` with `status = 'PENDING_REVIEW'` and JSONB-persisted documents.
    3. Updates `companies.verification_status = 'PENDING_REVIEW'` and updates `companies.registration_number` if supplied.
    4. Writes an immutable audit entry into `audit_logs` (`action = 'VERIFICATION_SUBMITTED'`).
* **Submission History (`GET /api/companies/:id/verifications`):**
  * Accessible by all active company members.
  * Returns complete historical verification submissions and reviewer notes sorted newest first.

### 2.2 Platform Administration Review & Decisions (`src/controllers/admin.controller.ts`)
* **Platform Admin RBAC Guard (`src/middleware/auth.ts`):**
  * `requirePlatformAdmin` validates that `req.user.role` is either `ADMIN` or `SUPER_ADMIN`.
  * Blocks unauthorized users with HTTP `403 Forbidden` (`"Platform administrator access required"`).
* **Pending Submissions Inbox (`GET /api/admin/verifications`):**
  * Queries all submissions in `PENDING_REVIEW` joined with company metadata (`name`, `country`, `registration_number`), ordered chronologically (`created_at ASC`) for fair FIFO triage.
* **Review Decision Handler (`POST /api/admin/verifications/:id/decision`):**
  * Validated by `adminVerificationDecisionSchema` (accepts `status: "APPROVED" | "REJECTED"` and optional `review_notes`).
  * Executes an atomic database transaction via `CompanyModel.decideVerification`:
    1. Locks the target `company_verifications` row (`FOR UPDATE`) to prevent race conditions.
    2. Validates that the request is currently in `PENDING_REVIEW` (rejects already decided requests with HTTP `409 Conflict`).
    3. Updates `company_verifications` with `status`, `reviewer_id`, `review_notes`, and `decided_at = CURRENT_TIMESTAMP`.
    4. Synchronizes `companies.verification_status`:
       * `APPROVED` $\rightarrow$ `VERIFIED`
       * `REJECTED` $\rightarrow$ `REJECTED`
    5. Writes an immutable record to `audit_logs` (`action = 'COMPANY_VERIFIED'` or `'COMPANY_REJECTED'`).

### 2.3 Feature Gating Guard (`src/middleware/company-auth.ts`)
* **`requireCompanyVerified` Middleware:**
  * Reusable guard for downstream services (e.g. publishing live jobs, creating contracts, initiating payouts).
  * Inspects `companies.verification_status`.
  * If status is not `VERIFIED` (`UNVERIFIED`, `PENDING_REVIEW`, or `REJECTED`), immediately rejects the request with HTTP `403 Forbidden` (`"Company verification required. Current verification status is ..."`).

---

## 3. How It Works (Verification State Machine & Sequence Flow)

### 3.1 Organization Verification State Machine

```
              [ Initial State ]
                      │
                      ▼
               ┌──────────────┐
               │  UNVERIFIED  │◄────────────────────┐
               └──────────────┘                     │
                      │                             │
                      │ [ submitVerification ]      │
                      ▼                             │
               ┌──────────────┐                     │ [ Re-submit docs ]
               │PENDING_REVIEW│                     │
               └──────────────┘                     │
                 │          │                       │
     [ Admin     │          │ [ Admin               │
       Approves ]│          │   Rejects ]           │
                 ▼          ▼                       │
    ┌──────────┐              ┌──────────┐          │
    │ VERIFIED │              │ REJECTED │──────────┘
    └──────────┘              └──────────┘
```

### 3.2 End-to-End Review Pipeline

```
Employer (Admin)             API Gateway               Platform Admin          Database / Audit Logs
       │                          │                          │                          │
       │── POST /:id/verifications ──►                       │                          │
       │   (Docs & Reg #)         │── Atomic Transaction ──────────────────────────────►│ 1. Insert verification
       │                          │                          │                          │ 2. Set PENDING_REVIEW
       │                          │                          │                          │ 3. Log VERIFICATION_SUBMITTED
       │◄── 201 Created ──────────│                          │                          │
       │                          │                          │                          │
       │                          │◄── GET /admin/verif ─────│                          │
       │                          │── Returns pending inbox ───────────────────────────►│ (Fetch FIFO queue)
       │                          │── 200 OK (Pending list) ─►                          │
       │                          │                          │                          │
       │                          │◄── POST /:id/decision ───│                          │
       │                          │   (APPROVED / REJECTED)  │── Atomic Transaction ───►│ 1. Check status == PENDING
       │                          │                          │                          │ 2. Set decided_at & notes
       │                          │                          │                          │ 3. Set VERIFIED / REJECTED
       │                          │                          │                          │ 4. Log COMPANY_VERIFIED
       │                          │── 200 OK (Updated) ──────►                          │
```

---

## 4. Why It Was Built This Way (PRD Rationale)

### 4.1 Multi-Layer Trust Separation (PRD §4.3)
* **PRD Requirement:** *"Identity verification, company verification, and work-evidence verification are different checks."*
* **Implementation:** Company verification is separated from individual user auth. A user can be fully authenticated via Better Auth while their organization remains `UNVERIFIED` or `PENDING_REVIEW`. Verification states are evaluated on the company entity, not on individual user records.

### 4.2 Non-Repudiable Audit Ledger (PRD §4.2 & §23)
* **PRD Requirement:** *"Maintain an audit record of verification decisions... Audit sensitive verification, permission, payment and restricted-data actions."*
* **Implementation:** The `audit_logs` table records every lifecycle change with `actor_id`, `action`, `entity_type`, `entity_id`, metadata, and client IP address. These records are strictly append-only (no update or delete operations exist).

### 4.3 Atomic State Synchronization
* **Business Risk:** An administrative decision updating the review notes without updating the public company verification flag causes broken trust states.
* **Implementation:** Both updates (`company_verifications` and `companies`) execute inside a single transactional block (`BEGIN ... COMMIT / ROLLBACK`), guaranteeing that the company status and decision record never fall out of sync.

---

## 5. Test Suite Verification Summary

Run the test suite with:
```sh
npm test
```

### Phase 4 Test Matrix (`tests/phase4.test.ts`)
| Test Case | Module / Guard | Expected Behavior | Status |
| :--- | :--- | :--- | :---: |
| `submitCompanyVerification submits documents` | `submitCompanyVerification` | `201 Created` with `status = 'PENDING_REVIEW'` | **PASS** |
| `submitCompanyVerification rejects unauth` | `submitCompanyVerification` | `401 Unauthorized` | **PASS** |
| `submitCompanyVerification handles missing company` | `submitCompanyVerification` | `404 Not Found` | **PASS** |
| `listCompanyVerifications returns history` | `listCompanyVerifications` | `200 OK` with submissions array | **PASS** |
| `requirePlatformAdmin blocks non-admin users` | `requirePlatformAdmin` | `403 Forbidden` | **PASS** |
| `requirePlatformAdmin allows ADMIN / SUPER_ADMIN` | `requirePlatformAdmin` | Calls `next()` | **PASS** |
| `listPendingVerifications returns pending queue` | `listPendingVerifications` | `200 OK` with pending list | **PASS** |
| `decideVerification approves submission` | `decideVerification` | `200 OK`, status `APPROVED`, company `VERIFIED` | **PASS** |
| `decideVerification handles missing record` | `decideVerification` | `404 Not Found` | **PASS** |
| `decideVerification rejects duplicate decisions` | `decideVerification` | `409 Conflict` (already decided) | **PASS** |
| `requireCompanyVerified blocks missing company ID` | `requireCompanyVerified` | `400 Bad Request` | **PASS** |
| `requireCompanyVerified blocks non-existent company` | `requireCompanyVerified` | `404 Not Found` | **PASS** |
| `requireCompanyVerified blocks UNVERIFIED company` | `requireCompanyVerified` | `403 Forbidden` | **PASS** |
| `requireCompanyVerified blocks PENDING_REVIEW company` | `requireCompanyVerified` | `403 Forbidden` | **PASS** |
| `requireCompanyVerified allows VERIFIED company` | `requireCompanyVerified` | Calls `next()` | **PASS** |

**Global Test Count:** **54 passing tests across 4 test suites**, 0 failures.

---

## 6. Phase 4 Completion Checklist
- [x] Employer verification submission endpoint (`POST /api/companies/:id/verifications`)
- [x] Company verification listing endpoint (`GET /api/companies/:id/verifications`)
- [x] Platform administrator guard (`requirePlatformAdmin`)
- [x] Pending verification review inbox (`GET /api/admin/verifications`)
- [x] Admin verification decision workflow with audit trail (`POST /api/admin/verifications/:id/decision`)
- [x] Reusable feature gating middleware (`requireCompanyVerified`)
- [x] Comprehensive automated test coverage (18 new tests, 54 total passing)
- [x] Formal Phase 4 architectural documentation
