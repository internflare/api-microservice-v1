CREATE TABLE IF NOT EXISTS opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  external_company_name VARCHAR,
  source_type VARCHAR NOT NULL,
  external_id VARCHAR,
  source_url VARCHAR,
  external_apply_url VARCHAR,
  title VARCHAR NOT NULL,
  description TEXT NOT NULL,
  responsibilities TEXT,
  opportunity_type VARCHAR NOT NULL,
  employment_type VARCHAR,
  experience_level VARCHAR,
  is_paid BOOLEAN NOT NULL,
  compensation_min NUMERIC(12, 2),
  compensation_max NUMERIC(12, 2),
  currency VARCHAR(3),
  payment_frequency VARCHAR,
  country VARCHAR(2),
  location VARCHAR,
  work_arrangement VARCHAR NOT NULL,
  skills_required TEXT[] NOT NULL DEFAULT '{}',
  duration_weeks INTEGER,
  start_date DATE,
  application_deadline TIMESTAMPTZ,
  openings INTEGER,
  status VARCHAR NOT NULL DEFAULT 'published',
  views_count INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS opportunities_published_created_idx
  ON opportunities (created_at DESC, id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS opportunities_type_created_idx
  ON opportunities (opportunity_type, created_at DESC);

CREATE INDEX IF NOT EXISTS opportunities_company_idx
  ON opportunities (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS opportunities_deadline_idx
  ON opportunities (application_deadline);

CREATE INDEX IF NOT EXISTS opportunities_skills_idx
  ON opportunities USING GIN (skills_required);
