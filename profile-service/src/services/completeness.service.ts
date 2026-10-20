import type {
  TalentProfileInput,
  CompletenessCalculation,
  MissingField,
} from "../types/talent.types.js";

/**
 * Pure calculation engine for talent profile completeness (0-100%).
 * Conforms to US-01, PRD §4.1:
 * - Basic Info (Full Name, Headline) -> 15%
 * - Contact & Location (Phone, Country, Location) -> 15%
 * - Skills (>= 3 skills) -> 15%
 * - Preferred Roles (>= 1 role) -> 10%
 * - Education (>= 1 entry) -> 15%
 * - Experience (>= 1 entry) -> 15%
 * - Preferences & Goals (Availability, Work Arrangement, Career Goals) -> 10%
 * - CV Upload (Valid CV URL) -> 5%
 * Total = 100%
 */
export function calculateProfileCompleteness(
  profile: Partial<TalentProfileInput>,
): CompletenessCalculation {
  const missing_fields: MissingField[] = [];
  let basic_info = 0;
  let contact_location = 0;
  let skills_score = 0;
  let roles_score = 0;
  let education_score = 0;
  let experience_score = 0;
  let preferences_score = 0;
  let cv_score = 0;

  // 1. Basic Info (15%)
  const hasName = Boolean(profile.full_name && profile.full_name.trim().length >= 2);
  const hasHeadline = Boolean(profile.headline && profile.headline.trim().length >= 2);

  if (hasName) basic_info += 10;
  else missing_fields.push({ field: "full_name", label: "Full Name", weight: 10 });

  if (hasHeadline) basic_info += 5;
  else missing_fields.push({ field: "headline", label: "Professional Headline", weight: 5 });

  // 2. Contact & Location (15%)
  const hasPhone = Boolean(profile.phone && profile.phone.trim().length >= 5);
  const hasCountry = Boolean(profile.country && profile.country.trim().length >= 2);
  const hasLocation = Boolean(profile.location && profile.location.trim().length >= 2);

  if (hasPhone) contact_location += 5;
  else missing_fields.push({ field: "phone", label: "Phone Number", weight: 5 });

  if (hasCountry) contact_location += 5;
  else missing_fields.push({ field: "country", label: "Country", weight: 5 });

  if (hasLocation) contact_location += 5;
  else missing_fields.push({ field: "location", label: "City / Location", weight: 5 });

  // 3. Skills (15%): requires at least 3 skills
  const skillsCount = Array.isArray(profile.skills)
    ? profile.skills.filter((s) => typeof s === "string" && s.trim().length > 0).length
    : 0;

  if (skillsCount >= 3) {
    skills_score = 15;
  } else if (skillsCount === 2) {
    skills_score = 10;
    missing_fields.push({ field: "skills", label: "Add at least 1 more skill (minimum 3)", weight: 5 });
  } else if (skillsCount === 1) {
    skills_score = 5;
    missing_fields.push({ field: "skills", label: "Add at least 2 more skills (minimum 3)", weight: 10 });
  } else {
    missing_fields.push({ field: "skills", label: "Skills (add at least 3 skills)", weight: 15 });
  }

  // 4. Preferred Roles (10%): requires at least 1 role
  const rolesCount = Array.isArray(profile.preferred_roles)
    ? profile.preferred_roles.filter((r) => typeof r === "string" && r.trim().length > 0).length
    : 0;

  if (rolesCount >= 1) {
    roles_score = 10;
  } else {
    missing_fields.push({ field: "preferred_roles", label: "Preferred Roles", weight: 10 });
  }

  // 5. Education (15%): requires at least 1 valid education entry
  const hasValidEdu = Array.isArray(profile.education) && profile.education.some(
    (edu) => edu && typeof edu.institution === "string" && edu.institution.trim().length > 0 &&
                  typeof edu.degree === "string" && edu.degree.trim().length > 0
  );

  if (hasValidEdu) {
    education_score = 15;
  } else {
    missing_fields.push({ field: "education", label: "Education History", weight: 15 });
  }

  // 6. Experience (15%): requires at least 1 valid experience entry
  const hasValidExp = Array.isArray(profile.experience) && profile.experience.some(
    (exp) => exp && typeof exp.company === "string" && exp.company.trim().length > 0 &&
                  typeof exp.title === "string" && exp.title.trim().length > 0
  );

  if (hasValidExp) {
    experience_score = 15;
  } else {
    missing_fields.push({ field: "experience", label: "Work Experience", weight: 15 });
  }

  // 7. Preferences & Goals (10%)
  const hasAvailability = Boolean(profile.availability && profile.availability.trim().length > 0);
  const hasWorkArrangement = Boolean(profile.work_arrangement_pref && profile.work_arrangement_pref.trim().length > 0);
  const hasCareerGoals = Boolean(profile.career_goals && profile.career_goals.trim().length >= 10);

  if (hasAvailability) preferences_score += 3;
  else missing_fields.push({ field: "availability", label: "Availability Status", weight: 3 });

  if (hasWorkArrangement) preferences_score += 3;
  else missing_fields.push({ field: "work_arrangement_pref", label: "Work Arrangement Preference", weight: 3 });

  if (hasCareerGoals) preferences_score += 4;
  else missing_fields.push({ field: "career_goals", label: "Career Goals & Summary", weight: 4 });

  // 8. CV Upload (5%)
  const hasCv = Boolean(profile.cv_url && profile.cv_url.trim().length > 5);
  if (hasCv) {
    cv_score = 5;
  } else {
    missing_fields.push({ field: "cv_url", label: "CV / Resume Upload", weight: 5 });
  }

  // Aggregate total
  const score = Math.min(
    100,
    basic_info +
      contact_location +
      skills_score +
      roles_score +
      education_score +
      experience_score +
      preferences_score +
      cv_score,
  );

  // Generate dynamic next_prompt for frontend banner (highest weight missing item)
  let next_prompt: string | null = null;
  if (missing_fields.length > 0) {
    const highestMissing = [...missing_fields].sort((a, b) => b.weight - a.weight)[0];
    next_prompt = `Add your ${highestMissing.label.toLowerCase()} to boost your profile completeness by +${highestMissing.weight}%!`;
  }

  return {
    score,
    missing_fields,
    next_prompt,
    breakdown: {
      basic_info,
      contact_location,
      skills: skills_score,
      preferred_roles: roles_score,
      education: education_score,
      experience: experience_score,
      preferences_goals: preferences_score,
      cv_url: cv_score,
    },
  };
}
