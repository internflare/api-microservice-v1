import type { RequestHandler } from "express";
import {
  deleteDraft,
  listCompanyDrafts,
  loadManagedDraft,
  saveDraft,
  type DraftRecord,
} from "../services/draft.service.js";
import { AppError } from "../utils/appError.js";
import { checkAdmin } from "../utils/helperFunc.js";
import { forwardError } from "../utils/forward-error.js";
import {
  draftSchema,
  objectIdSchema,
  requireUserId,
} from "../validators/opportunity.validator.js";

type DraftFields = Parameters<typeof saveDraft>[0];

// Expands the validated payload into a full listing-shaped record (unset fields become null).
const toDraftFields = (
  input: ReturnType<typeof draftSchema.parse>,
  company: { id: string; name: string },
  userId: string,
): DraftFields => ({
  company_id: company.id,
  external_company_name: company.name,
  source_type: input.source_type,
  external_id: null,
  source_url: null,
  external_apply_url: input.external_apply_url ?? null,
  title: input.title,
  description: input.description,
  responsibilities: input.responsibilities ?? null,
  role_id: input.role_id ?? null,
  opportunity_type: input.opportunity_type,
  employment_type: input.employment_type ?? null,
  experience_level: input.experience_level ?? null,
  is_paid: input.is_paid,
  compensation_min: input.compensation_min ?? null,
  compensation_max: input.compensation_max ?? null,
  currency: input.currency ?? null,
  payment_frequency: input.payment_frequency ?? null,
  country: input.country ?? null,
  location: input.location ?? null,
  work_arrangement: input.work_arrangement,
  skills_required: input.skills_required ?? [],
  duration_weeks: input.duration_weeks ?? null,
  start_date: input.start_date ?? null,
  application_deadline: input.application_deadline ?? null,
  openings: input.openings ?? null,
  last_synced_at: null,
  expires_at: null,
  created_by: userId,
});

const parseDraftBody = (body: unknown) => {
  const parsed = draftSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new AppError(`Invalid draft payload (${issues})`, 400);
  }
  return parsed.data;
};

const parseDraftId = (id: unknown): string => {
  const parsed = objectIdSchema.safeParse(id);
  if (!parsed.success) throw new AppError("Draft id must be a valid id", 400);
  return parsed.data;
};

// POST /drafts: store a new draft for a company the caller administers.
const createDraftHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const input = parseDraftBody(request.body);
    const company = await checkAdmin(input.company_id, userId);
    if (!company) {
      throw new AppError("Active company administrator access required", 403);
    }
    const draft = await saveDraft(toDraftFields(input, company, userId));
    response.status(201).json({ opportunity: draft });
  } catch (error) {
    forwardError(error, next, "Failed to save draft:", "Could not save draft");
  }
};

// PUT /drafts/:id: replace an existing draft (the company cannot be changed).
const updateDraftHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const id = parseDraftId(request.params.id);
    const input = parseDraftBody(request.body);
    const { draft: existing, company } = await loadManagedDraft(id, userId);
    if (input.company_id !== existing.company_id) {
      throw new AppError("A draft cannot be moved to another company", 400);
    }
    const draft = await saveDraft(toDraftFields(input, company, userId), existing);
    response.status(200).json({ opportunity: draft });
  } catch (error) {
    forwardError(error, next, "Failed to update draft:", "Could not update draft");
  }
};

// GET /drafts/:id
const getDraftHandler: RequestHandler = async (request, response, next) => {
  try {
    const { draft } = await loadManagedDraft(
      parseDraftId(request.params.id),
      requireUserId(request),
    );
    response.status(200).json({ opportunity: draft });
  } catch (error) {
    forwardError(error, next, "Failed to load draft:", "Could not load draft");
  }
};

// GET /drafts?company_id=...: every draft of a company the caller administers.
const listDraftsHandler: RequestHandler = async (request, response, next) => {
  try {
    const userId = requireUserId(request);
    const companyId = objectIdSchema.safeParse(request.query.company_id);
    if (!companyId.success) throw new AppError("company_id must be a valid id", 400);
    if (!(await checkAdmin(companyId.data, userId))) {
      throw new AppError("Active company administrator access required", 403);
    }
    const drafts: DraftRecord[] = await listCompanyDrafts(companyId.data);
    response.status(200).json({ data: drafts, total: drafts.length });
  } catch (error) {
    forwardError(error, next, "Failed to list drafts:", "Could not list drafts");
  }
};

// DELETE /drafts/:id
const deleteDraftHandler: RequestHandler = async (request, response, next) => {
  try {
    const { draft } = await loadManagedDraft(
      parseDraftId(request.params.id),
      requireUserId(request),
    );
    await deleteDraft(draft);
    response.status(204).end();
  } catch (error) {
    forwardError(error, next, "Failed to delete draft:", "Could not delete draft");
  }
};

export {
  createDraftHandler,
  deleteDraftHandler,
  getDraftHandler,
  listDraftsHandler,
  updateDraftHandler,
};
