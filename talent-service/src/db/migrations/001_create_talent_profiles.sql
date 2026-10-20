-- Create talent_profiles table
CREATE TABLE IF NOT EXISTS talent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  full_name VARCHAR(255),
  phone VARCHAR(50),
  country VARCHAR(100),
  location VARCHAR(255),
  headline VARCHAR(255),
  education JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  preferred_roles TEXT[] NOT NULL DEFAULT '{}'::text[],
  availability VARCHAR(50),
  work_arrangement_pref VARCHAR(50),
  career_goals TEXT,
  cv_url VARCHAR(1024),
  profile_completeness INT NOT NULL DEFAULT 0,
  readiness_score INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optimize queries by user identity
CREATE INDEX IF NOT EXISTS idx_talent_profiles_user_id ON talent_profiles(user_id);

-- GIN indexing for array membership and filter operations (e.g. skills @> '{react}', preferred_roles)
CREATE INDEX IF NOT EXISTS idx_talent_profiles_skills_gin ON talent_profiles USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_preferred_roles_gin ON talent_profiles USING GIN (preferred_roles);

-- Performance indexes for search, ranking and sorting
CREATE INDEX IF NOT EXISTS idx_talent_profiles_completeness ON talent_profiles(profile_completeness);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_country ON talent_profiles(country);
CREATE INDEX IF NOT EXISTS idx_talent_profiles_availability ON talent_profiles(availability);
