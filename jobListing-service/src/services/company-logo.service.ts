import mongoose, { Types } from "mongoose";

// Adds company_logo_url to listings with one lookup. Done after the cache read so a
// changed logo shows up immediately without invalidating cached listing bodies.
async function attachCompanyLogos<T extends { company_id: string | null }>(
  items: T[],
): Promise<Array<T & { company_logo_url: string | null }>> {
  const ids = [
    ...new Set(items.map((item) => item.company_id).filter((id): id is string => !!id)),
  ].filter((id) => Types.ObjectId.isValid(id));
  const logos = new Map<string, string>();
  if (ids.length > 0) {
    const companies = await mongoose.connection
      .collection("companies")
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .project({ logo_url: 1 })
      .toArray();
    for (const company of companies) {
      if (company.logo_url) logos.set(String(company._id), company.logo_url);
    }
  }
  return items.map((item) => ({
    ...item,
    company_logo_url: (item.company_id && logos.get(item.company_id)) || null,
  }));
}

export { attachCompanyLogos };
