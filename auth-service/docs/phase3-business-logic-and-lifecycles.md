# Phase 3: Company & Member Business Logic & Lifecycles — Documentation

## 1. Executive Summary
This document provides formal architectural documentation for **Phase 3** of the Internflare Company & Member Management subsystem (PRD §4.2, §4.3, §14; Employer Journey steps 33–34).

Phase 3 implements the end-to-end transactional business logic for company profile lifecycles and team membership workflows. It features atomic organization provisioning with initial administrator assignment, conflict-free member invitation and acceptance, and strict soft-removal access revocation with sole-administrator retention safeguards.

---

## 2. What Was Built

### 2.1 Company Lifecycle Operations (`CompanyModel` & `company.controller.ts`)
* **Atomic Creation (`createCompanyWithAdmin`):**
  * When a user creates a company (`POST /api/companies`), the operation executes inside an atomic PostgreSQL transaction (`BEGIN ... COMMIT / ROLLBACK`).
  * Concurrently:
    1. Inserts the company row into `companies` with `verification_status = 'UNVERIFIED'`.
    2. Registers the creating user as the initial `ACTIVE` member with `workspace_role = 'ADMIN'`.
    3. Emits an immutable audit record to `audit_logs` (`action = 'COMPANY_CREATED'`).
* **Profile Reading (`findCompanyById` / `getCompanyById`):**
  * Safe lookup via `GET /api/companies/:id`, excluding soft-deleted organizations (`WHERE deleted_at IS NULL`).
* **Profile Updates (`updateCompany`):**
  * Dynamic, parameterized SQL query updating only supplied fields (`name`, `website`, `country`, `industry`, `registration_number`, `logo_url`).
  * Logs the modified keys into `audit_logs` (`action = 'COMPANY_UPDATED'`).

### 2.2 Team Member Management Lifecycle
* **Member Invitations (`inviteMember` / `inviteCompanyMember`):**
  * Handles `POST /api/companies/:id/members/invite` with workspace role (`ADMIN` or `MEMBER`).
  * **Conflict Prevention:** Rejects duplicate invitations if the user is already `ACTIVE` or `INVITED` with HTTP `409 Conflict`.
  * **Re-invitation Handling:** If a user was previously in `REMOVED` status, restores their membership back to `INVITED` with the new role and clears `removed_at`.
  * Logs `MEMBER_INVITED` audit event.
* **Member Listing (`listMembers` / `listCompanyMembers`):**
  * Provides `GET /api/companies/:id/members`, returning member IDs, user IDs, roles, and status history (`joined_at`, `removed_at`).
* **Invitation Acceptance (`acceptInvite` / `acceptMembershipInvite`):**
  * `POST /api/companies/:id/members/accept` allows the authenticated user to claim their pending invitation.
  * Transitions status from `INVITED` to `ACTIVE` and records `joined_at = CURRENT_TIMESTAMP`.
  * Emits `MEMBER_ACCEPTED` to `audit_logs`.
* **Access Revocation & Soft Removal (`softRemoveMember` / `removeCompanyMember`):**
  * `DELETE /api/companies/:id/members/:memberId` executes non-destructive soft removal.
  * **PRD §14 Compliance:** Sets `status = 'REMOVED'` and timestamps `removed_at = CURRENT_TIMESTAMP`. Zero hard `DELETE` queries are executed.
  * **Sole Admin Guard:** Verifies whether the target member is the sole active administrator. If `adminCount <= 1`, throws an error and returns HTTP `400 Bad Request` (`"Cannot remove the sole active administrator of a company"`).
  * Emits `MEMBER_REMOVED` to `audit_logs`.

---

## 3. How It Works (State Transitions & Architecture)

### 3.1 Membership Lifecycle State Machine

```
                   [ Invite Sent ]
                          │
                          ▼
                   ┌──────────────┐
       ┌───────────│   INVITED    │◄───────────┐
       │           └──────────────┘            │
       │                  │                    │
[ Revoked before          │ [ acceptInvite ]   │ [ Re-invited ]
  acceptance ]            ▼                    │
       │           ┌──────────────┐            │
       │           │    ACTIVE    │            │
       │           └──────────────┘            │
       │                  │                    │
       │                  │ [ softRemoveMember]│
       │                  ▼                    │
       │           ┌──────────────┐            │
       └──────────►│   REMOVED    │────────────┘
                   └──────────────┘
```

1. **`INVITED`**: Created when an administrator invites a user. Cannot perform company actions (`requireCompanyMember` blocks with `403`).
2. **`ACTIVE`**: Established upon invitation acceptance or company creation. Full access governed by `workspace_role`.
3. **`REMOVED`**: Access instantly revoked across all company routes (`403 Forbidden`). All database records and history remain intact.

---

## 4. Why It Was Built This Way (PRD Rationale)

### 4.1 Zero Data Loss & Audit Accountability (PRD §14 & Acceptance Criteria #19)
* **PRD Requirement:** *"Removing a member revokes access without deleting company-owned project records."*
* **Implementation:** Hard `DELETE FROM company_members` is strictly prohibited. Membership removal is exclusively an `UPDATE ... SET status = 'REMOVED', removed_at = CURRENT_TIMESTAMP`. This ensures downstream services (projects, timesheets, documents) never encounter broken foreign key cascades or orphaned historical data.

### 4.2 Sole Administrator Protection
* **Business Risk:** An organization where the last remaining active administrator is removed or removes themselves becomes permanently headless and unmanageable.
* **Implementation:** Before transitioning an `ADMIN` member to `REMOVED`, `CompanyModel.softRemoveMember` performs a transactional count of active admins. If only one remains, the transaction aborts with `Cannot remove the sole active administrator of a company`.

### 4.3 Atomic Creation Transaction
* **Business Risk:** If company record creation succeeds but admin member creation fails, an orphaned company exists without any authorized owner.
* **Implementation:** Organization insertion and creator admin assignment are wrapped in an atomic database transaction (`BEGIN ... COMMIT / ROLLBACK`). Both succeed together or fail completely.

---

## 5. Test Suite Verification Summary

Run all tests via:
```sh
npm test
```

### Phase 3 Test Matrix (`tests/phase3.test.ts`)
| Test Case | Method / Route | Expected Outcome | Status |
| :--- | :--- | :--- | :---: |
| `createCompany creates organization and creator as ADMIN` | `POST /api/companies` | `201 Created` with company and active admin member | **PASS** |
| `createCompany rejects unauthenticated request` | `POST /api/companies` | `401 Unauthorized` | **PASS** |
| `getCompanyById returns details for active company` | `GET /api/companies/:id` | `200 OK` with company object | **PASS** |
| `getCompanyById returns 404 for missing company` | `GET /api/companies/:id` | `404 Not Found` | **PASS** |
| `updateCompany updates profile fields` | `PATCH /api/companies/:id` | `200 OK` with updated company | **PASS** |
| `updateCompany returns 404 for missing company` | `PATCH /api/companies/:id` | `404 Not Found` | **PASS** |
| `inviteCompanyMember creates invitation` | `POST /:id/members/invite` | `201 Created` with member in `INVITED` status | **PASS** |
| `inviteCompanyMember detects existing active/pending user` | `POST /:id/members/invite` | `409 Conflict` | **PASS** |
| `listCompanyMembers returns team roster` | `GET /:id/members` | `200 OK` with array of members | **PASS** |
| `acceptMembershipInvite transitions status to ACTIVE` | `POST /:id/members/accept` | `200 OK` with `ACTIVE` status and `joined_at` | **PASS** |
| `acceptMembershipInvite returns 404 when no invite exists` | `POST /:id/members/accept` | `404 Not Found` | **PASS** |
| `removeCompanyMember soft-removes member (PRD §14)` | `DELETE /:id/members/:memberId` | `200 OK` with `REMOVED` status and `removed_at` | **PASS** |
| `removeCompanyMember blocks sole active admin removal` | `DELETE /:id/members/:memberId` | `400 Bad Request` | **PASS** |

**Global Test Count:** **36 passing tests across 3 test suites**, 0 failures.

---

## 6. Phase 3 Completion Checklist
- [x] Transactional company creation with creator assigned as active admin
- [x] Parameterized company profile retrieval and updates
- [x] Conflict-checked member invitation workflow
- [x] Member invitation acceptance transitioning to active status
- [x] Soft removal preserving records while revoking access (PRD §14)
- [x] Sole administrator removal prevention safeguard
- [x] Immutable audit log emission across all mutating operations
- [x] Full automated test coverage (13 new tests, 36 total passing)
- [x] Formal Phase 3 architectural documentation
