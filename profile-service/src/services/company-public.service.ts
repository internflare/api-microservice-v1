import { CompanyModel, companyIdFilter } from "../models/company.model.js";
import { OpportunityDocument } from "../models/company.schema.js";
import { CompanyFollowerModel } from "../models/company-follower.model.js";
import { cacheAside, cacheKeys, invalidate } from "./cache.service.js";
import { AppError } from "../utils/appError.js";

// Opportunities are written by jobListing-service, so a short TTL keeps this view fresh without cross-service invalidation.
const PUBLIC_COMPANY_TTL_SECONDS = 60;
const MAX_OPEN_OPPORTUNITIES = 50;

export interface PublicCompanyProfile {
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  country: string | null;
  industry: string | null;
  description: string | null;
  culture: string | null;
  verification_status: string;
  created_at: string | null;
  follower_count: number;
  open_opportunities: Array<{
    id: string;
    title: string;
    opportunity_type: string | null;
    employment_type: string | null;
    work_arrangement: string | null;
    location: string | null;
    is_paid: boolean | null;
    skills_required: string[];
    created_at: string | null;
  }>;
}

async function loadPublicProfile(companyId: string): Promise<PublicCompanyProfile> {
  const company = await CompanyModel.findCompanyById(companyId);
  if (!company) throw new AppError("Company not found", 404);

  const [followerCount, opportunities] = await Promise.all([
    CompanyFollowerModel.countFollowers(companyId),
    OpportunityDocument.find({ ...companyIdFilter(companyId), status: "published" })
      .sort({ created_at: -1 })
      .limit(MAX_OPEN_OPPORTUNITIES)
      .select("title opportunity_type employment_type work_arrangement location is_paid skills_required created_at")
      .lean(),
  ]);

  return {
    id: company.id,
    name: company.name,
    logo_url: company.logo_url ?? null,
    website: company.website ?? null,
    country: company.country ?? null,
    industry: company.industry ?? null,
    description: company.description ?? null,
    culture: company.culture ?? null,
    verification_status: company.verification_status,
    created_at: company.created_at ? new Date(company.created_at as unknown as string).toISOString() : null,
    follower_count: followerCount,
    open_opportunities: opportunities.map((item: any) => ({
      id: String(item._id),
      title: item.title,
      opportunity_type: item.opportunity_type ?? null,
      employment_type: item.employment_type ?? null,
      work_arrangement: item.work_arrangement ?? null,
      location: item.location ?? null,
      is_paid: item.is_paid ?? null,
      skills_required: item.skills_required ?? [],
      created_at: item.created_at ? new Date(item.created_at).toISOString() : null,
    })),
  };
}

// Returns the cached public profile; `is_following` is per-viewer so it is computed outside the cache.
export async function getPublicCompanyProfile(
  companyId: string,
  viewerId?: string,
): Promise<PublicCompanyProfile & { is_following: boolean }> {
  const profile = await cacheAside(
    cacheKeys.companyPublic(companyId),
    () => loadPublicProfile(companyId),
    PUBLIC_COMPANY_TTL_SECONDS,
  );
  const isFollowing = viewerId ? await CompanyFollowerModel.isFollowing(companyId, viewerId) : false;
  return { ...profile, is_following: isFollowing };
}

export async function followCompany(companyId: string, userId: string): Promise<void> {
  if (!(await CompanyModel.findCompanyById(companyId))) throw new AppError("Company not found", 404);
  await CompanyFollowerModel.follow(companyId, userId);
  await invalidate(cacheKeys.companyPublic(companyId));
}

export async function unfollowCompany(companyId: string, userId: string): Promise<void> {
  await CompanyFollowerModel.unfollow(companyId, userId);
  await invalidate(cacheKeys.companyPublic(companyId));
}

export const invalidateCompanyPublic = (companyId: string) => invalidate(cacheKeys.companyPublic(companyId));
