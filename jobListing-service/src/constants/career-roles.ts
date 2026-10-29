// Career roles assessed by ai-service; a listing's role_id must be one of these.
export const CAREER_ROLE_IDS = [
  "frontend-developer",
  "data-analyst",
  "backend-engineer",
  "product-designer",
  "growth-marketer",
  "support-engineer",
  "virtual-assistant",
  "programme-assistant",
] as const;

export type CareerRoleId = (typeof CAREER_ROLE_IDS)[number];
