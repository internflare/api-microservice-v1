// Role catalogue mirrored from the frontend pathway config so placement rules stay identical.
export type ExpertiseLevel = "intern" | "junior" | "mid" | "senior";
export type Placement = "learning" | "internship" | "job";

export interface Competency {
  id: string;
  label: string;
  description: string;
}

export interface CareerRole {
  id: string;
  title: string;
  family: string;
  // Roles where talents write or review code get coding-style questions.
  isDeveloper: boolean;
  // Lowercase keywords used to match a talent's skills and preferred roles to this role.
  keywords: string[];
  competencies: Competency[];
  thresholds: Record<"internship" | "job", number>;
  coreMins: Record<"internship" | "job", { competencyId: string; min: number }[]>;
}

export const expertiseLevels: {
  id: ExpertiseLevel;
  label: string;
  ceiling: number;
}[] = [
  { id: "intern", label: "Intern", ceiling: 70 },
  { id: "junior", label: "Junior", ceiling: 88 },
  { id: "mid", label: "Mid-level", ceiling: 96 },
  { id: "senior", label: "Senior", ceiling: 100 },
];

export const careerRoles: CareerRole[] = [
  {
    id: "frontend-developer",
    title: "Frontend Developer",
    family: "Engineering",
    isDeveloper: true,
    keywords: ["frontend", "front-end", "react", "vue", "angular", "css", "html", "javascript", "typescript", "ui developer", "next.js"],
    competencies: [
      { id: "fe-react", label: "React & component design", description: "Builds composable, stateful UI components" },
      { id: "fe-ts", label: "TypeScript", description: "Types props, data and APIs safely" },
      { id: "fe-testing", label: "Automated testing", description: "Writes unit and integration tests for user flows" },
      { id: "fe-a11y", label: "Accessibility", description: "Meets WCAG basics for forms, focus and semantics" },
      { id: "fe-deploy", label: "Production delivery", description: "Has shipped and maintained work used by real people" },
      { id: "fe-comm", label: "Written communication", description: "Explains decisions clearly in PRs and case studies" },
    ],
    thresholds: { internship: 60, job: 72 },
    coreMins: {
      internship: [{ competencyId: "fe-react", min: 55 }],
      job: [{ competencyId: "fe-testing", min: 60 }, { competencyId: "fe-deploy", min: 60 }],
    },
  },
  {
    id: "backend-engineer",
    title: "Backend Engineer",
    family: "Engineering",
    isDeveloper: true,
    keywords: ["backend", "back-end", "node", "node.js", "express", "api", "java", "python", "django", "flask", "go", "golang", "c#", ".net", "php", "laravel", "ruby", "postgres", "sql", "server"],
    competencies: [
      { id: "be-api", label: "API design", description: "Designs predictable, versioned HTTP APIs" },
      { id: "be-db", label: "Databases & SQL", description: "Models data, writes migrations and indexes" },
      { id: "be-testing", label: "Automated testing", description: "Covers services with unit and integration tests" },
      { id: "be-deploy", label: "Production operations", description: "Deploys, monitors and debugs live services" },
      { id: "be-comm", label: "Technical communication", description: "Documents designs and incidents clearly" },
    ],
    thresholds: { internship: 60, job: 74 },
    coreMins: {
      internship: [{ competencyId: "be-api", min: 55 }],
      job: [{ competencyId: "be-db", min: 65 }, { competencyId: "be-deploy", min: 60 }],
    },
  },
  {
    id: "data-analyst",
    title: "Data Analyst",
    family: "Data",
    isDeveloper: false,
    keywords: ["data", "analyst", "analytics", "sql", "excel", "power bi", "tableau", "statistics", "looker"],
    competencies: [
      { id: "da-sql", label: "SQL querying", description: "Joins, aggregates and filters relational data" },
      { id: "da-sheets", label: "Spreadsheet analysis", description: "Pivot tables, lookups and clean data structures" },
      { id: "da-stats", label: "Statistics basics", description: "Averages, distributions and comparing groups" },
      { id: "da-viz", label: "Data visualisation", description: "Chooses honest, readable charts and dashboards" },
      { id: "da-comm", label: "Insight communication", description: "Summarises findings for non-technical readers" },
    ],
    thresholds: { internship: 58, job: 72 },
    coreMins: {
      internship: [{ competencyId: "da-sql", min: 55 }],
      job: [{ competencyId: "da-sql", min: 70 }, { competencyId: "da-stats", min: 60 }],
    },
  },
  {
    id: "product-designer",
    title: "Product Designer",
    family: "Design",
    isDeveloper: false,
    keywords: ["design", "designer", "figma", "ux", "ui", "prototype", "user research", "sketch"],
    competencies: [
      { id: "pd-research", label: "User research", description: "Plans and synthesises interviews and tests" },
      { id: "pd-interaction", label: "Interaction design", description: "Designs clear flows and states" },
      { id: "pd-visual", label: "Visual design", description: "Typography, layout and brand consistency" },
      { id: "pd-proto", label: "Prototyping", description: "Builds testable prototypes in Figma or code" },
      { id: "pd-comm", label: "Design communication", description: "Presents rationale and handles critique" },
    ],
    thresholds: { internship: 60, job: 72 },
    coreMins: {
      internship: [{ competencyId: "pd-interaction", min: 55 }],
      job: [{ competencyId: "pd-research", min: 60 }],
    },
  },
  {
    id: "growth-marketer",
    title: "Growth Marketer",
    family: "Marketing",
    isDeveloper: false,
    keywords: ["marketing", "growth", "seo", "content", "copywriting", "social media", "ads", "email marketing"],
    competencies: [
      { id: "gm-content", label: "Content & copy", description: "Writes channel-appropriate content" },
      { id: "gm-analytics", label: "Marketing analytics", description: "Reads funnels and attribution reports" },
      { id: "gm-experiments", label: "Experimentation", description: "Designs and evaluates simple A/B tests" },
      { id: "gm-comm", label: "Stakeholder communication", description: "Reports results and next steps" },
    ],
    thresholds: { internship: 55, job: 70 },
    coreMins: { internship: [], job: [{ competencyId: "gm-analytics", min: 60 }] },
  },
  {
    id: "support-engineer",
    title: "Support Engineer",
    family: "Engineering",
    isDeveloper: false,
    keywords: ["support", "customer success", "troubleshooting", "helpdesk", "technical support"],
    competencies: [
      { id: "se-troubleshoot", label: "Troubleshooting", description: "Reproduces and isolates customer issues" },
      { id: "se-apis", label: "APIs & logs", description: "Reads API responses and logs" },
      { id: "se-comm", label: "Customer communication", description: "Explains fixes with empathy and clarity" },
    ],
    thresholds: { internship: 55, job: 65 },
    coreMins: { internship: [], job: [{ competencyId: "se-comm", min: 65 }] },
  },
  {
    id: "virtual-assistant",
    title: "Virtual Assistant",
    family: "Operations",
    isDeveloper: false,
    keywords: ["virtual assistant", "assistant", "admin", "calendar", "inbox", "notion", "scheduling"],
    competencies: [
      { id: "va-calendar", label: "Calendar & inbox management", description: "Triages email and schedules across time zones" },
      { id: "va-tools", label: "Productivity tools", description: "Google Workspace, Notion, spreadsheets and automations" },
      { id: "va-comm", label: "Professional communication", description: "Writes clear, polite, on-brand messages" },
      { id: "va-judgement", label: "Prioritisation & discretion", description: "Handles urgency, confidentiality and escalation" },
    ],
    thresholds: { internship: 55, job: 68 },
    coreMins: { internship: [], job: [{ competencyId: "va-comm", min: 65 }] },
  },
  {
    id: "programme-assistant",
    title: "Programme Assistant",
    family: "Operations",
    isDeveloper: false,
    keywords: ["programme", "program", "facilitation", "coordinator", "events", "operations"],
    competencies: [
      { id: "pa-facilitation", label: "Facilitation", description: "Runs sessions for small groups" },
      { id: "pa-digital", label: "Digital tools", description: "Uses Google Workspace confidently" },
      { id: "pa-comm", label: "Communication", description: "Writes clear updates and reports" },
    ],
    thresholds: { internship: 50, job: 65 },
    coreMins: { internship: [], job: [] },
  },
];

export const getRole = (roleId: string): CareerRole | undefined =>
  careerRoles.find((role) => role.id === roleId);

export const getLevel = (levelId: ExpertiseLevel) =>
  expertiseLevels.find((level) => level.id === levelId)!;
