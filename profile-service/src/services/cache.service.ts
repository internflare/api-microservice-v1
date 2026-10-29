import { createClient } from "redis";
import { config } from "../config.js";

const PREFIX = "profile";

// Key builders keep naming consistent between reads and invalidation.
const cacheKeys = {
  talentProfile: (userId: string) => `${PREFIX}:talent:${userId}`,
  companyPublic: (companyId: string) => `${PREFIX}:company:${companyId}:public`,
  talentPool: `${PREFIX}:talent-pool`,
} as const;

const client = createClient({
  url: config.redisUrl,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 200, 5_000) },
});

// Without a listener, a Redis connection error would crash the process.
client.on("error", (error) =>
  console.error("[profile-service] Redis client error:", error),
);

// The cache is optional: failing to connect must not stop the service.
async function connectCache(): Promise<void> {
  try {
    await client.connect();
    console.log("[profile-service] Connected to Redis cache");
  } catch (error) {
    console.warn("[profile-service] Redis unavailable; continuing without cache:", error);
  }
}

async function closeCache(): Promise<void> {
  if (client.isOpen) await client.quit();
}

// Read-through helper: returns the cached value, otherwise runs `load`, stores the result and returns it.
// Any Redis failure is treated as a miss, so the database is always the fallback.
async function cacheAside<T>(
  key: string,
  load: () => Promise<T>,
  ttlSeconds?: number,
): Promise<T> {
  if (client.isReady) {
    try {
      const hit = await client.get(key);
      if (hit !== null) return JSON.parse(hit) as T;
    } catch (error) {
      console.warn(`[profile-service] Cache read failed for ${key}:`, error);
    }
  }

  const value = await load();
  if (client.isReady && value !== undefined) {
    try {
      await client.set(key, JSON.stringify(value), ttlSeconds ? { EX: ttlSeconds } : {});
    } catch (error) {
      console.warn(`[profile-service] Cache write failed for ${key}:`, error);
    }
  }
  return value;
}

// Drop cached keys after a write; failures are logged, never thrown, so a write is never undone by Redis.
async function invalidate(...keys: string[]): Promise<void> {
  if (!client.isReady || keys.length === 0) return;
  try {
    await client.del(keys);
  } catch (error) {
    console.error("[profile-service] Cache invalidation failed:", keys, error);
  }
}

export { cacheAside, cacheKeys, closeCache, connectCache, invalidate };
