// Career tools offered to talents. Each tool is a prompt over the talent's real data;
// the model may only use facts supplied in the request.

export interface CareerToolDefinition {
  id: string;
  instruction: string;
  // Free text the talent must provide (e.g. the CV to review).
  inputRequired: boolean;
  // A listing the output is about; its facts are loaded server-side.
  needsOpportunity: boolean;
}

const GROUNDING = [
  "Use ONLY the facts in the provided data. Never invent employers, projects, metrics, skills, qualifications or dates.",
  "Where information is missing, write a clear [placeholder] for the talent to fill in instead of guessing.",
  "Write plain text only: no markdown symbols (#, **, backticks). Use short ALL-CAPS section headings and '-' bullets where structure helps.",
].join(" ");

export const careerTools: CareerToolDefinition[] = [
  {
    id: "cv-builder",
    inputRequired: false,
    needsOpportunity: false,
    instruction:
      "Build a clean, structured CV for the target role named in the context: summary, experience, education, skills. Order sections by relevance to the role. Reflect the talent's emphasis notes if given.",
  },
  {
    id: "cv-review",
    inputRequired: true,
    needsOpportunity: false,
    instruction:
      "Review the CV text the talent pasted, for the target role in the context. Output STRENGTHS, IMPROVEMENTS (numbered, specific and actionable, citing the CV's own wording) and NOT SUGGESTED (what you will not add because it is not in their profile). Do not rewrite the whole CV.",
  },
  {
    id: "cover-letter",
    inputRequired: false,
    needsOpportunity: true,
    instruction:
      "Write a tailored cover letter (under 250 words) for the listing, opening with 'Dear Hiring Team,'. Weave in the talent's own reason for applying if given. Match their real skills and experience to the listing's requirements and sign off with their name.",
  },
  {
    id: "outreach",
    inputRequired: true,
    needsOpportunity: false,
    instruction:
      "Write a short, personal outreach message (under 120 words) for the situation in the context, to the person described in the talent's notes. It must sound human, mention one relevant real strength, and end with a clear low-pressure ask. The talent sends it themselves.",
  },
  {
    id: "proposal",
    inputRequired: true,
    needsOpportunity: false,
    instruction:
      "Write a freelance proposal for the client need described. Sections: UNDERSTANDING, APPROACH (phased, with week estimates), RELEVANT WORK (only the talent's real experience), INVESTMENT (leave as a [placeholder] price), NEXT STEP.",
  },
  {
    id: "skill-gap",
    inputRequired: true,
    needsOpportunity: false,
    instruction:
      "Compare the pasted job description with the talent's profile. Output MATCHED (with the evidence from the profile), PARTIAL, MISSING and SUGGESTED NEXT STEPS. Be honest; do not credit skills the profile does not show.",
  },
  {
    id: "match-explain",
    inputRequired: false,
    needsOpportunity: true,
    instruction:
      "Explain in plain language how well the talent fits this listing and why, using the listing facts, the eligibility result and the talent's profile and assessments. Answer the talent's question if they asked one. End with the single biggest thing that would improve their chances.",
  },
  {
    id: "readiness-explain",
    inputRequired: false,
    needsOpportunity: false,
    instruction:
      "Explain the talent's job-readiness in plain language using their real assessment results (role, level, score, placement) and profile completeness. Say what the placement means, what is holding the score back and what to do next. Be encouraging and make clear it reflects current evidence, not potential. If they have no assessments yet, say so and recommend taking one.",
  },
  {
    id: "interview-practice",
    inputRequired: true,
    needsOpportunity: false,
    instruction:
      "The talent wrote an answer to an interview question (the question may be at the top of their text). Give feedback: STRUCTURE, EVIDENCE, DELIVERY, and an IMPROVED VERSION of the answer that keeps only facts the talent gave. Note that practice feedback is private.",
  },
  {
    id: "project-recs",
    inputRequired: false,
    needsOpportunity: false,
    instruction:
      "Recommend 3 to 4 practical projects that would build verifiable evidence for the target role in the context, given the talent's current skills, experience and assessment gaps and the weekly time they have. For each: what to build, what skill it proves and a rough time estimate. Do not invent links or course names.",
  },
];

export const careerToolIds = careerTools.map((tool) => tool.id) as [string, ...string[]];

export const getCareerTool = (id: string): CareerToolDefinition | undefined =>
  careerTools.find((tool) => tool.id === id);

export const careerToolGrounding = GROUNDING;
