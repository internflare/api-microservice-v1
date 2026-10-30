import { Types } from "mongoose";
import type { OpportunityRecord } from "../models/opportunity.model.js";
import { AppError } from "../utils/appError.js";
import { logger } from "../utils/logger.js";
import { checkAdmin } from "../utils/helperFunc.js";
import { cacheClient } from "./cache.service.js";

// Drafts live only in Redis (never MongoDB). Redis runs with AOF persistence, and the
// TTL below is refreshed on every save so abandoned drafts eventually clean themselves up.
const DRAFT_TTL_SECONDS = 60 * 60 * 24 * 30;

const draftKey = (id: string) => `joblisting:draft:${id}`;
const companyDraftIndexKey = (companyId: string) =>
  `joblisting:company:${companyId}:drafts`;

// A draft has the shape of a listing so the frontend can render it like any other.
export type DraftRecord = OpportunityRecord & { status: "draft" };

// Unlike the best-effort read cache, drafts have no database fallback, so an unavailable
// Redis must fail the request loudly instead of silently losing the user's work.
const requireRedis = (): typeof cacheClient => {
  if (!cacheClient.isReady) {
    throw new AppError(
      "Draft storage is temporarily unavailable. Please try again shortly.",
      503,
    );
  }
  return cacheClient;
};

// Creates (no id) or replaces (with id) a draft and refreshes its expiry.
async function saveDraft(
  fields: Omit<
    DraftRecord,
    "id" | "status" | "views_count" | "created_at" | "updated_at"
  >,
  existing?: DraftRecord,
): Promise<DraftRecord> {
  const redis = requireRedis();
  const now = new Date();
  const draft: DraftRecord = {
    ...fields,
    id: existing?.id ?? new Types.ObjectId().toHexString(),
    status: "draft",
    views_count: 0,
    created_at: existing?.created_at ?? now,
    updated_at: existing ? now : null,
  };
  await redis
    .multi()
    .set(draftKey(draft.id), JSON.stringify(draft), {
      EX: DRAFT_TTL_SECONDS,
    })
    .sAdd(companyDraftIndexKey(fields.company_id as string), draft.id)
    .exec();
  return draft;
}

async function getDraft(id: string): Promise<DraftRecord | null> {
  const hit = await requireRedis().get(draftKey(id));
  return hit === null ? null : (JSON.parse(hit) as DraftRecord);
}

// Newest first. Ids whose drafts expired are pruned from the index as they are found.
async function listCompanyDrafts(companyId: string): Promise<DraftRecord[]> {
  const redis = requireRedis();
  const ids = await redis.sMembers(companyDraftIndexKey(companyId));
  if (ids.length === 0) return [];
  const values = await redis.mGet(ids.map(draftKey));
  const drafts: DraftRecord[] = [];
  const expired: string[] = [];
  values.forEach((value, index) => {
    if (value === null) expired.push(ids[index]);
    else drafts.push(JSON.parse(value) as DraftRecord);
  });
  if (expired.length) {
    await redis
      .sRem(companyDraftIndexKey(companyId), expired)
      .catch((error: unknown) => logger("warn", "Draft index prune failed:", error));
  }
  return drafts.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

async function deleteDraft(draft: DraftRecord): Promise<void> {
  await requireRedis()
    .multi()
    .del(draftKey(draft.id))
    .sRem(companyDraftIndexKey(draft.company_id as string), draft.id)
    .exec();
}

// Loads a draft and confirms the user administers its company: 404 when missing or expired,
// 403 when the user is not an active admin of the owning company.
async function loadManagedDraft(
  id: string,
  userId: string,
): Promise<{ draft: DraftRecord; company: { id: string; name: string } }> {
  const draft = await getDraft(id);
  if (!draft) throw new AppError("Draft not found", 404);
  const company = await checkAdmin(draft.company_id as string, userId);
  if (!company) {
    throw new AppError("Active company administrator access required", 403);
  }
  return { draft, company };
}

export { deleteDraft, getDraft, listCompanyDrafts, loadManagedDraft, saveDraft };
