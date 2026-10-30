import { createClient } from "redis";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const PREFIX = "joblisting";

// Key builders keep naming consistent between reads and invalidation.
const companyListKey = (companyId: string, page: number, pageSize: number) =>
  `${PREFIX}:company:${companyId}:list:${page}:${pageSize}`;
const companyListIndexKey = (companyId: string) =>
  `${PREFIX}:company:${companyId}:lists`;
const opportunityKey = (id: string) => `${PREFIX}:opportunity:${id}`;
// Public search results are keyed by their normalized query string.
const publicListKey = (normalizedQuery: string) =>
  `${PREFIX}:public:list:${normalizedQuery}`;
const publicListIndexKey = `${PREFIX}:public:lists`;
// Saved lists are per talent; a global index lets listing changes clear every talent's copy.
const savedListKey = (talentId: string, page: number, pageSize: number) =>
  `${PREFIX}:saved:${talentId}:list:${page}:${pageSize}`;
const savedListIndexKey = (talentId: string) =>
  `${PREFIX}:saved:${talentId}:lists`;
const allSavedListIndexKey = `${PREFIX}:saved:all-lists`;

// Safety net for key sets that can grow without bound (free-text searches).
const PUBLIC_LIST_TTL_SECONDS = 300;

// Connect to Redis immediately to ensure availability.
const client = createClient({
  url: config.redisUrl,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5_000) },
});

// Without a listener, a Redis connection error would crash the process.
client.on("error", (error) => logger("error", "Redis client error:", error));

// Cache is optional: failure to connect must not stop the service.
async function connectCache(): Promise<void> {
  try {
    await client.connect();
    logger("info", "Connected to Redis cache");
  } catch (error) {
    logger("warn", "Redis unavailable; continuing without cache:", error);
  }
}

async function closeCache(): Promise<void> {
  if (client.isOpen) await client.quit();
}

// Read a cached JSON value; returns null on a miss or any Redis failure (treated as a miss).
async function getCached<T>(key: string): Promise<T | null> {
  if (!client.isReady) return null;
  try {
    const hit = await client.get(key);
    return hit === null ? null : (JSON.parse(hit) as T);
  } catch (error) {
    logger("warn", `Cache read failed for ${key}:`, error);
    return null;
  }
}

// Store a JSON value (no expiry unless ttlSeconds is given). When indexKeys are given the key is
// tracked in those sets so it can be deleted together with its siblings later.
// Failures are logged, never thrown.
async function setCached(
  key: string,
  value: unknown,
  indexKeys?: string | string[],
  ttlSeconds?: number,
): Promise<void> {
  if (!client.isReady) return;
  try {
    const multi = client
      .multi()
      .set(key, JSON.stringify(value), ttlSeconds ? { EX: ttlSeconds } : {});
    for (const indexKey of [indexKeys ?? []].flat()) multi.sAdd(indexKey, key);
    await multi.exec();
  } catch (error) {
    logger("warn", `Cache write failed for ${key}:`, error);
  }
}

// Delete every key tracked by the given index sets, then the sets themselves, plus extra keys.
async function deleteIndexed(
  indexKeys: string[],
  extraKeys: string[] = [],
): Promise<void> {
  const members = await Promise.all(indexKeys.map((k) => client.sMembers(k)));
  await client.del([...members.flat(), ...indexKeys, ...extraKeys]);
}

// Any listing change makes this company's lists, the public search results and every saved
// list (they embed listing data) stale; the changed listing's detail key is dropped too.
async function invalidateCompany(
  companyId: string,
  opportunityId?: string,
): Promise<void> {
  if (!client.isReady) return;
  try {
    await deleteIndexed(
      [
        companyListIndexKey(companyId),
        publicListIndexKey,
        allSavedListIndexKey,
      ],
      opportunityId ? [opportunityKey(opportunityId)] : [],
    );
  } catch (error) {
    logger(
      "error",
      `Cache invalidation failed for company ${companyId}:`,
      error,
    );
  }
}

// Saving or unsaving only changes that talent's saved lists.
async function invalidateSaved(talentId: string): Promise<void> {
  if (!client.isReady) return;
  try {
    await deleteIndexed([savedListIndexKey(talentId)]);
  } catch (error) {
    logger(
      "error",
      `Cache invalidation failed for talent ${talentId}:`,
      error,
    );
  }
}

export {
  allSavedListIndexKey,
  client as cacheClient,
  closeCache,
  companyListIndexKey,
  companyListKey,
  connectCache,
  getCached,
  invalidateCompany,
  invalidateSaved,
  opportunityKey,
  PUBLIC_LIST_TTL_SECONDS,
  publicListIndexKey,
  publicListKey,
  savedListIndexKey,
  savedListKey,
  setCached,
};
