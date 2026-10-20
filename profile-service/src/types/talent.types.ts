export interface EducationItem {
  institution: string;
  degree: string;
  field_of_study?: string;
  start_year?: number;
  end_year?: number | null;
}

export interface ExperienceItem {
  company: string;
  title: string;
  location?: string;
  start_date?: string;
  end_date?: string | null;
  current?: boolean;
  description?: string;
}

export type AvailabilityOption = string;
export type WorkArrangementOption = string;

export interface TalentProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  country: string | null;
  location: string | null;
  headline: string | null;
  education: EducationItem[];
  experience: ExperienceItem[];
  skills: string[];
  preferred_roles: string[];
  availability: AvailabilityOption | null;
  work_arrangement_pref: WorkArrangementOption | null;
  career_goals: string | null;
  cv_url: string | null;
  profile_completeness: number;
  readiness_score: number;
  created_at: string;
  updated_at: string;
}

export interface MissingField {
  field: string;
  label: string;
  weight: number;
}

export interface CompletenessCalculation {
  score: number;
  missing_fields: MissingField[];
  next_prompt: string | null;
  breakdown: {
    basic_info: number;
    contact_location: number;
    skills: number;
    preferred_roles: number;
    education: number;
    experience: number;
    preferences_goals: number;
    cv_url: number;
  };
}

export interface TalentProfileInput {
  full_name?: string | null;
  phone?: string | null;
  country?: string | null;
  location?: string | null;
  headline?: string | null;
  education?: EducationItem[];
  experience?: ExperienceItem[];
  skills?: string[];
  preferred_roles?: string[];
  availability?: AvailabilityOption | null;
  work_arrangement_pref?: WorkArrangementOption | null;
  career_goals?: string | null;
  cv_url?: string | null;
}

export interface TalentSearchQuery {
  skills?: string[];
  country?: string;
  availability?: string;
  work_arrangement_pref?: string;
  min_completeness?: number;
  limit?: number;
  offset?: number;
}
