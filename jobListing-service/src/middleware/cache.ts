import type { Request, RequestHandler } from "express";
import {
  companyListKey,
  getCached,
  opportunityKey,
  publicListKey,
  savedListKey,
} from "../services/cache.service.js";
import {
  companyListPaginationSchema,
  objectIdSchema,
  paginationSchema,
  resolveManagedCompanyId,
} from "../validators/opportunity.validator.js";

// Builds a middleware that looks the request up in Redis and hands the result to the controller:
//   response.locals.cacheKey -> key the controller saves to on a miss (undefined = not cacheable)
//   response.locals.cached   -> cached payload on a hit, or null on a miss
// It never responds itself and never fails the request; the controller runs access checks and sends the JSON.
const cacheLookup =
  (buildKey: (request: Request) => string | null): RequestHandler =>
  async (request, response, next) => {
    response.locals.cached = null;
    try {
      const key = buildKey(request);
      if (key) {
        response.locals.cacheKey = key;
        response.locals.cached = await getCached<unknown>(key);
      }
    } catch {
      // A lookup problem is treated as a miss so the controller falls back to the database.
      response.locals.cached = null;
    }
    next();
  };

// Company-scoped key; null when the request is not a valid company-scoped listing.
const companyScopedKey = (request: Request): string | null => {
  const companyId = objectIdSchema.safeParse(resolveManagedCompanyId(request));
  const pagination = companyListPaginationSchema.safeParse(request.query);
  if (!companyId.success || !pagination.success) return null;
  return companyListKey(
    companyId.data,
    pagination.data.page,
    pagination.data.page_size,
  );
};

// Stable key for a public search: query params sorted so equal searches share one entry.
const normalizeQuery = (query: Request["query"]): string =>
  Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([name, value]) => [name, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("&");

// Company-scoped requests use the company list key; public searches use a normalized-query key.
// Only published results are cached: other statuses need an admin check and must hit the database.
const opportunityListCache = cacheLookup((request) => {
  if (resolveManagedCompanyId(request) !== undefined) {
    return companyScopedKey(request);
  }
  const status = request.query.status;
  if (status !== undefined && status !== "published") return null;
  return publicListKey(normalizeQuery(request.query));
});

// Saved list key for the signed-in talent (requireAuth runs before this middleware).
const savedListCache = cacheLookup((request) => {
  const pagination = paginationSchema.safeParse(request.query);
  if (!request.user?.id || !pagination.success) return null;
  return savedListKey(
    request.user.id,
    pagination.data.page,
    pagination.data.page_size,
  );
});

// Opportunity detail key; null when the id is not a valid ObjectId.
const opportunityDetailCache = cacheLookup((request) => {
  const id = objectIdSchema.safeParse(request.params.id);
  return id.success ? opportunityKey(id.data) : null;
});

export { opportunityDetailCache, opportunityListCache, savedListCache };
