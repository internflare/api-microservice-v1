import mongoose, { Types } from "mongoose";
import { AppError } from "./appError.js";

// Returns the company name and id if the user is an active admin of it, otherwise false.
// Company and membership ids are stored as ObjectIds, so string ids are cast before querying.
async function checkAdmin(
  companyId: string,
  userId: string,
): Promise<{ name: string; id: string } | false> {
  if (!Types.ObjectId.isValid(companyId) || !Types.ObjectId.isValid(userId)) return false;
  const companyObjectId = new Types.ObjectId(companyId);

  const membership = await mongoose.connection
    .collection("companymembers")
    .findOne(
      {
        company_id: companyObjectId,
        user_id: { $in: [new Types.ObjectId(userId), userId] },
        workspace_role: "ADMIN",
        status: "ACTIVE",
      },
      { projection: { company_id: 1 } },
    );
  if (!membership) return false;

  const company = await mongoose.connection
    .collection("companies")
    .findOne<{ _id: Types.ObjectId; name: string }>(
      { _id: companyObjectId, deleted_at: null },
      { projection: { name: 1 } },
    );
  if (!company)
    throw new AppError(
      "Company not found, company should exist if membership exists",
      404,
    );
  return { name: company.name, id: String(company._id) };
}

// Best-effort lookup of a user's email/name from the auth collection (Better Auth `user`).
async function findUserContact(
  userId: string,
): Promise<{ email: string; name?: string } | null> {
  const filters: Record<string, unknown>[] = [{ id: userId }];
  if (Types.ObjectId.isValid(userId)) {
    filters.push({ _id: new Types.ObjectId(userId) });
  }
  const user = await mongoose.connection
    .collection("user")
    .findOne<{ email?: string; name?: string }>({ $or: filters });
  return user?.email ? { email: user.email, name: user.name } : null;
}

// Emails of everyone who should hear about a company's applications: its active admins plus
// the listing creator, de-duplicated by address.
async function findHiringContacts(
  companyId: string | null,
  creatorId: string | null,
): Promise<Array<{ email: string; name?: string }>> {
  const userIds = new Set<string>();
  if (creatorId) userIds.add(String(creatorId));
  if (companyId && Types.ObjectId.isValid(companyId)) {
    const admins = await mongoose.connection
      .collection("companymembers")
      .find(
        { company_id: new Types.ObjectId(companyId), workspace_role: "ADMIN", status: "ACTIVE" },
        { projection: { user_id: 1 } },
      )
      .toArray();
    admins.forEach((admin) => userIds.add(String(admin.user_id)));
  }

  const contacts = await Promise.all([...userIds].map((id) => findUserContact(id)));
  const unique = new Map<string, { email: string; name?: string }>();
  contacts.forEach((contact) => {
    if (contact) unique.set(contact.email.toLowerCase(), contact);
  });
  return [...unique.values()];
}

export { checkAdmin, findUserContact, findHiringContacts };
