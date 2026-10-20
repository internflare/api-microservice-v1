-- Internflare Company Service
-- Migration: 001_create_company_tables.sql
-- Description: Creates companies, company_members, company_verifications, and audit_logs tables.
-- PRD References: PRD §4.2, §4.3 (Trust & Verification), §14 (Knowledge Retention).

-- Ensure UUID generation is available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    country VARCHAR(2),
    industry VARCHAR(100),
    registration_number VARCHAR(100),
    logo_url VARCHAR(500),
    verification_status VARCHAR(50) NOT NULL DEFAULT 'UNVERIFIED'
        CONSTRAINT chk_companies_verification_status 
        CHECK (verification_status IN ('UNVERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED')),
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_companies_verification_status ON companies(verification_status);
CREATE INDEX IF NOT EXISTS idx_companies_created_by ON companies(created_by);
CREATE INDEX IF NOT EXISTS idx_companies_country ON companies(country);

-- 2. Company Members Table
-- PRD Rule: Removing a member sets status to 'REMOVED' and records removed_at. No hard deletes.
CREATE TABLE IF NOT EXISTS company_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    workspace_role VARCHAR(50) NOT NULL DEFAULT 'MEMBER'
        CONSTRAINT chk_company_members_workspace_role 
        CHECK (workspace_role IN ('ADMIN', 'MEMBER')),
    status VARCHAR(50) NOT NULL DEFAULT 'INVITED'
        CONSTRAINT chk_company_members_status 
        CHECK (status IN ('INVITED', 'ACTIVE', 'REMOVED')),
    joined_at TIMESTAMPTZ DEFAULT NULL,
    removed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_company_members_status ON company_members(status);

-- Prevent duplicate active or pending invitations for the same user in a company
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_user_active_or_invited 
    ON company_members(company_id, user_id) 
    WHERE status IN ('INVITED', 'ACTIVE');

-- 3. Company Verifications Table
-- PRD §4.2: Audit record of verification decisions and documents submitted.
CREATE TABLE IF NOT EXISTS company_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_REVIEW'
        CONSTRAINT chk_company_verifications_status 
        CHECK (status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
    reviewer_id TEXT DEFAULT NULL,
    review_notes TEXT DEFAULT NULL,
    documents JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_verifications_company_id ON company_verifications(company_id);
CREATE INDEX IF NOT EXISTS idx_company_verifications_status ON company_verifications(status);

-- 4. Audit Logs Table
-- Immutable audit log of administrative and sensitive security events.
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id TEXT NOT NULL,
    metadata JSONB DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
