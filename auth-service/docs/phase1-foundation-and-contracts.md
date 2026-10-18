# Phase 1: Foundation, Migration & Contracts — Documentation

## 1. Executive Summary
This document provides the formal architectural documentation for **Phase 1** of the Internflare Company & Member Management subsystem (PRD §4.2, §4.3, §14; Employer Journey steps 33–34).

Phase 1 establishes the relational database persistence models, database migration tooling, strict runtime validation schemas, API routing contracts, and automated validation tests.

---

## 2. What Was Built

### 2.1 Domain Models & Typing (`src/types/company.types.ts`)
* Defined TypeScript interfaces and enums for:
  * `Company`: Core organization entity with verification lifecycle.
  * `CompanyMember`: Team member representation with workspace role (`ADMIN` | `MEMBER`) and lifecycle state (`INVITED` | `ACTIVE` | `REMOVED`).
  * `CompanyVerification`: Audit-ready verification record with submitted documents, review notes, and admin decisions.
  * `AuditLog`: Immutable audit trail entity tracking actor, action, target entity, metadata, and IP address.

### 2.2 Relational Database Schema (`src/db/migrations/001_create_company_tables.sql`)
Created four production-grade PostgreSQL tables with strict constraints and indexes:
1. **`companies`**:
   * Attributes: `id` (UUID PK), `name`, `website`, `country` (CHAR(2)), `industry`, `registration_number`, `logo_url`, `verification_status`, `created_by`, timestamps, `deleted_at`.
   * Enforced status constraint: `CHECK (verification_status IN ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'))`.
   * Indexes on `verification_status`, `created_by`, and `country`.
2. **`company_members`**:
   * Attributes: `id` (UUID PK), `company_id` (FK), `user_id`, `workspace_role`, `status`, `joined_at`, `removed_at`, timestamps.
   * Enforced constraints:
     * `CHECK (workspace_role IN ('ADMIN', 'MEMBER'))`
     * `CHECK (status IN ('INVITED', 'ACTIVE', 'REMOVED'))`
   * Unique partial index: `uq_company_user_active_or_invited` ensures a user cannot have duplicate active/invited memberships in the same company.
3. **`company_verifications`**:
   * Attributes: `id` (UUID PK), `company_id` (FK), `status`, `reviewer_id`, `review_notes`, `documents` (JSONB), `created_at`, `decided_at`.
   * Enforced status constraint: `CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED'))`.
4. **`audit_logs`**:
   * Attributes: `id` (UUID PK), `actor_id`, `action`, `entity_type`, `entity_id`, `metadata` (JSONB), `ip_address`, `created_at`.
   * Indexes on `actor_id`, `(entity_type, entity_id)`, and `created_at DESC`.

### 2.3 Transactional Migration Runner (`src/db/migrate.ts`)
* Implemented a programmatic, transactional runner that creates a `schema_migrations` tracking table.
* Reads SQL migration files sequentially and executes each unapplied file inside an atomic PostgreSQL transaction (`BEGIN ... COMMIT / ROLLBACK`).
* Added `npm run db:migrate` script to `package.json`.

### 2.4 Strict Schema Validation (`src/validators/company.validator.ts`)
* Built Zod validation schemas enforcing strict input sanitization:
  * `createCompanySchema`: Name length limits (2–255), URL validation for website/logo, ISO 3166-1 alpha-2 uppercase country code regex (`/^[A-Z]{2}$/`).
  * `updateCompanySchema`: Safe partial updates preventing modification of immutable identifiers.
  * `inviteMemberSchema`: Role whitelisting (`ADMIN` | `MEMBER`), non-empty user IDs.
  * `submitVerificationSchema`: Enforces at least 1 valid document object (`title`, valid `url`, optional `document_type`).
  * `adminVerificationDecisionSchema`: Enforces decision status (`APPROVED` | `REJECTED`) and note length limits.
  * `uuidParamSchema` & `memberParamSchema`: Enforces RFC 4122 compliant UUIDs on URL route parameters.

### 2.5 Validation Middleware & Router Contracts
* `src/middleware/validate.ts`: Reusable `validateBody` and `validateParams` returning standardized `400 Bad Request` with field-level error messages upon invalid payloads.
* `src/routes/company.routes.ts`: Routes mounted at `/api/companies` for CRUD, invitations, membership acceptance, soft removal, and verification submissions.
* `src/routes/admin.routes.ts`: Routes mounted at `/api/admin` for verification reviews and administrative decisions.
* Mounted cleanly in `src/app.ts`.

### 2.6 Automated Test Suite (`tests/phase1.test.ts`)
* Implemented 10 unit tests covering all validator rules, parameter constraints, and edge cases using Node.js native test runner (`node:test`).
* Added `npm test` script to `package.json`.

---

## 3. How It Works (Architecture & Data Flow)

```
Incoming HTTP Request
       │
       ▼
[ CORS & Body Parser ] (JSON limit: 16kb)
       │
       ▼
[ validateParams / validateBody ] (Zod Schemas)
  ├── Invalid ──> 400 Bad Request (Formatted Error Array)
  └── Valid ───> Sanitized Payload passed to Handler
       │
       ▼
[ Route Handler / Controller ]
       │
       ▼
[ PostgreSQL Model / Pool ] (Parameterized SQL & DB Transactions)
```

1. **Strict Type Safety:** Incoming untrusted HTTP requests pass through Zod validators before any controller logic executes.
2. **Safe Database Operations:** The schema migration guarantees that foreign keys, uniqueness rules, and status transitions are validated at both the application level and the database level.
3. **Idempotent Migrations:** Running `npm run db:migrate` safely checks existing applied migrations against `schema_migrations`, preventing duplicate execution.

---

## 4. Why It Was Built This Way (PRD Rationale)

1. **Zero Data Loss & Knowledge Retention (PRD §14 & Acceptance Criteria #19):**
   * *Requirement:* "Removing a member revokes access without deleting company-owned project records."
   * *Design Decision:* We added explicit `status IN ('INVITED', 'ACTIVE', 'REMOVED')` and `removed_at TIMESTAMPTZ` columns to `company_members`. Hard `DELETE` operations are completely avoided.
2. **Multi-Layer Trust Separation (PRD §4.3):**
   * *Requirement:* "Identity verification, company verification and work-evidence verification are different checks."
   * *Design Decision:* Company verification is separated into its own dedicated entity (`company_verifications`) and `verification_status` flag on `companies`, completely distinct from individual user profile identity verification.
3. **Immutable Audit Accountability (PRD §4.2 & §23):**
   * *Requirement:* "Maintain an audit record of verification decisions... Audit sensitive verification, permission, payment and restricted-data actions."
   * *Design Decision:* The `audit_logs` table provides an immutable ledger recording actor ID, action name, target entity, IP address, and payload diffs.

---

## 5. Security & Quality Measures Implemented

| Security Concern | Measure Implemented |
| :--- | :--- |
| **SQL Injection** | All dynamic values are strictly parameterized (`$1`, `$2`) in queries; no string interpolation in SQL. |
| **Payload Tampering / Mass Assignment** | Zod schemas explicitly whitelist permitted fields (`name`, `country`, etc.) and strip or reject unallowed fields like `verification_status` or `id`. |
| **Input Format Exploits** | Strict regex validation on ISO country codes (`/^[A-Z]{2}$/`), RFC 4122 UUID validation on URL route parameters, and URL protocol checks. |
| **State Tampering** | Status columns are protected with database-level `CHECK` constraints, preventing unauthorized or invalid states even if code errors occur. |
| **Race Conditions on Invites** | PostgreSQL partial unique index `uq_company_user_active_or_invited` guarantees that concurrent requests cannot produce duplicate active or pending memberships. |

---

## 6. Verification & Test Results

Running `npm test` yields:
```text
TAP version 13
# Subtest: Phase 1 - Sprint 1.2: Validation Schema Suite
    ok 1 - createCompanySchema should accept valid company payload
    ok 2 - createCompanySchema should reject invalid country code
    ok 3 - createCompanySchema should reject short company name
    ok 4 - updateCompanySchema should allow partial updates
    ok 5 - inviteMemberSchema should validate roles
    ok 6 - submitVerificationSchema requires at least one document
    ok 7 - adminVerificationDecisionSchema accepts only APPROVED or REJECTED
    ok 8 - uuidParamSchema validates UUID format
    ok 9 - memberParamSchema validates both company and member UUIDs
ok 1 - Phase 1 - Sprint 1.2: Validation Schema Suite
1..1
# tests 10
# suites 0
# pass 10
# fail 0
# duration_ms 1288
```

TypeScript compiler check (`npm run type-check`) passed with **0 errors**.
