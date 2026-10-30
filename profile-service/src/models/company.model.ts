import mongoose, { type ClientSession } from "mongoose";
import { AppError } from "../utils/appError.js";
import {
  AuditLogDocument,
  CompanyDocument,
  CompanyMemberDocument,
  CompanyVerificationDocument,
  OpportunityDocument,
  stringifyObjectIds,
} from "./company.schema.js";
import type {
  Company,
  CompanyMember,
  CompanyMemberRole,
  CompanyVerification,
} from "../types/company.types.js";
import type {
  AdminVerificationDecisionInput,
  CreateCompanyInput,
  SubmitVerificationInput,
  UpdateCompanyInput,
} from "../validators/company.validator.js";

function serialize<T>(value: any): T {
  if (!value) return value;
  const result = typeof value.toObject === "function" ? value.toObject() : { ...value };
  result.id = String(result.id ?? result._id);
  delete result._id;
  delete result.__v;
  stringifyObjectIds(result);
  return result as T;
}

async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function recordAudit(
  entry: {
    actor_id: string;
    action: string;
    entity_type: "company" | "company_member" | "company_verification";
    entity_id: string;
    metadata: Record<string, unknown>;
    ip_address?: string;
  },
  session: ClientSession,
): Promise<void> {
  await AuditLogDocument.create([entry], { session });
}

function isObjectId(value: string): boolean {
  return mongoose.isValidObjectId(value);
}

export function companyIdFilter(companyId: string): Record<string, unknown> {
  const values: unknown[] = [companyId];
  if (isObjectId(companyId)) values.push(new mongoose.Types.ObjectId(companyId));
  return { company_id: { $in: values } };
}

export class CompanyModel {
  static async createCompanyWithAdmin(
    input: CreateCompanyInput,
    userId: string,
    clientIp?: string,
  ): Promise<{ company: Company; member: CompanyMember }> {
    return inTransaction(async (session) => {
      const [companyDoc] = await CompanyDocument.create(
        [{ ...input, verification_status: "UNVERIFIED", created_by: userId }],
        { session },
      );
      const [memberDoc] = await CompanyMemberDocument.create(
        [{ company_id: companyDoc._id, user_id: userId, workspace_role: "ADMIN", status: "ACTIVE", joined_at: new Date() }],
        { session },
      );
      const company = serialize<Company>(companyDoc);
      const member = serialize<CompanyMember>(memberDoc);
      await recordAudit({
        actor_id: userId,
        action: "COMPANY_CREATED",
        entity_type: "company",
        entity_id: company.id,
        metadata: { company_name: company.name, creator_role: "ADMIN" },
        ip_address: clientIp,
      }, session);
      return { company, member };
    });
  }

  static async findCompanyById(companyId: string): Promise<Company | null> {
    if (!isObjectId(companyId)) return null;
    const company = await CompanyDocument.findOne({ _id: companyId, deleted_at: null }).lean();
    return company ? serialize<Company>(company) : null;
  }

  static async updateCompany(
    companyId: string,
    input: UpdateCompanyInput,
    userId: string,
    clientIp?: string,
  ): Promise<Company | null> {
    if (!isObjectId(companyId)) return null;
    const fields = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
    if (Object.keys(fields).length === 0) return this.findCompanyById(companyId);

    return inTransaction(async (session) => {
      const updated = await CompanyDocument.findOneAndUpdate(
        { _id: companyId, deleted_at: null },
        { $set: fields },
        { new: true, runValidators: true, session },
      ).lean();
      if (!updated) return null;
      const company = serialize<Company>(updated);
      await recordAudit({
        actor_id: userId,
        action: "COMPANY_UPDATED",
        entity_type: "company",
        entity_id: companyId,
        metadata: { updated_fields: Object.keys(input) },
        ip_address: clientIp,
      }, session);
      return company;
    });
  }

  static async findMember(companyId: string, userId: string): Promise<CompanyMember | null> {
    if (!isObjectId(companyId)) return null;
    const member = await CompanyMemberDocument.findOne({ company_id: companyId, user_id: userId }).lean();
    return member ? serialize<CompanyMember>(member) : null;
  }

  static async findMemberById(companyId: string, memberId: string): Promise<CompanyMember | null> {
    if (!isObjectId(companyId) || !isObjectId(memberId)) return null;
    const member = await CompanyMemberDocument.findOne({ company_id: companyId, _id: memberId }).lean();
    return member ? serialize<CompanyMember>(member) : null;
  }

  static async listMembers(companyId: string): Promise<CompanyMember[]> {
    if (!isObjectId(companyId)) return [];
    const members = await CompanyMemberDocument.find({ company_id: companyId }).sort({ created_at: 1 }).lean();
    return members.map((member: unknown) => serialize<CompanyMember>(member));
  }

  static async isCompanyAdmin(userId: string): Promise<string | null> {
    const member: any = await CompanyMemberDocument.findOne({ user_id: userId, workspace_role: "ADMIN", status: "ACTIVE" }).lean();
    return member ? String(member.company_id) : null;
  }

  static async listActiveAdminCompaniesForUser(
    userId: string,
  ): Promise<Array<Pick<Company, "id" | "name" | "country">>> {
    const memberships = await CompanyMemberDocument.find({ user_id: userId, workspace_role: "ADMIN", status: "ACTIVE" })
      .sort({ created_at: 1 }).lean();
    const ids = memberships.map((member: any) => member.company_id);
    const companies = await CompanyDocument.find({ _id: { $in: ids }, deleted_at: null }).lean();
    const byId = new Map(companies.map((company: any) => [String(company._id), company]));
    return ids.flatMap((id: unknown) => {
      const company: any = byId.get(String(id));
      return company ? [{ id: String(company._id), name: company.name, country: company.country ?? null }] : [];
    });
  }

  static async inviteMember(
    companyId: string,
    invitedUserId: string,
    role: CompanyMemberRole,
    actorId: string,
    clientIp?: string,
  ): Promise<CompanyMember> {
    if (!isObjectId(companyId)) throw new AppError("Company not found", 404);
    return inTransaction(async (session) => {
      const existing = await CompanyMemberDocument.findOne({ company_id: companyId, user_id: invitedUserId }).session(session);
      let memberDoc: any;
      if (existing) {
        if (existing.status === "ACTIVE") throw new AppError("User is already an active member of this company", 409);
        if (existing.status === "INVITED") throw new AppError("User already has a pending invitation to this company", 409);
        memberDoc = await CompanyMemberDocument.findByIdAndUpdate(
          existing._id,
          { $set: { status: "INVITED", workspace_role: role, removed_at: null } },
          { new: true, runValidators: true, session },
        );
      } else {
        [memberDoc] = await CompanyMemberDocument.create(
          [{ company_id: companyId, user_id: invitedUserId, workspace_role: role, status: "INVITED" }],
          { session },
        );
      }
      const member = serialize<CompanyMember>(memberDoc);
      await recordAudit({
        actor_id: actorId,
        action: "MEMBER_INVITED",
        entity_type: "company_member",
        entity_id: member.id,
        metadata: { company_id: companyId, invited_user_id: invitedUserId, assigned_role: role },
        ip_address: clientIp,
      }, session);
      return member;
    });
  }

  static async acceptInvite(
    companyId: string,
    userId: string,
    clientIp?: string,
  ): Promise<CompanyMember | null> {
    if (!isObjectId(companyId)) return null;
    return inTransaction(async (session) => {
      const memberDoc = await CompanyMemberDocument.findOneAndUpdate(
        { company_id: companyId, user_id: userId, status: "INVITED" },
        { $set: { status: "ACTIVE", joined_at: new Date() } },
        { new: true, runValidators: true, session },
      );
      if (!memberDoc) return null;
      const member = serialize<CompanyMember>(memberDoc);
      await recordAudit({
        actor_id: userId,
        action: "MEMBER_ACCEPTED",
        entity_type: "company_member",
        entity_id: member.id,
        metadata: { company_id: companyId, role: member.workspace_role },
        ip_address: clientIp,
      }, session);
      return member;
    });
  }

  static async softRemoveMember(
    companyId: string,
    memberId: string,
    actorId: string,
    clientIp?: string,
  ): Promise<CompanyMember | null> {
    if (!isObjectId(companyId) || !isObjectId(memberId)) return null;
    return inTransaction(async (session) => {
      const target = await CompanyMemberDocument.findOne({ company_id: companyId, _id: memberId }).session(session);
      if (!target) return null;
      if (target.status === "REMOVED") return serialize<CompanyMember>(target);
      if (target.workspace_role === "ADMIN" && target.status === "ACTIVE") {
        const admins = await CompanyMemberDocument.countDocuments({ company_id: companyId, workspace_role: "ADMIN", status: "ACTIVE" }).session(session);
        if (admins <= 1) throw new AppError("Cannot remove the sole active administrator of a company", 400);
      }
      const updatedDoc = await CompanyMemberDocument.findByIdAndUpdate(
        memberId,
        { $set: { status: "REMOVED", removed_at: new Date() } },
        { new: true, runValidators: true, session },
      );
      const member = serialize<CompanyMember>(updatedDoc);
      await recordAudit({
        actor_id: actorId,
        action: "MEMBER_REMOVED",
        entity_type: "company_member",
        entity_id: memberId,
        metadata: { company_id: companyId, removed_user_id: target.user_id, previous_role: target.workspace_role },
        ip_address: clientIp,
      }, session);
      return member;
    });
  }

  static async submitVerification(
    companyId: string,
    input: SubmitVerificationInput,
    userId: string,
    clientIp?: string,
  ): Promise<CompanyVerification> {
    if (!isObjectId(companyId)) throw new AppError("Company not found", 404);
    return inTransaction(async (session) => {
      const company = await CompanyDocument.findOne({ _id: companyId, deleted_at: null }).session(session);
      if (!company) throw new AppError("Company not found", 404);
      const [verificationDoc] = await CompanyVerificationDocument.create(
        [{ company_id: companyId, status: "PENDING_REVIEW", documents: input.documents }],
        { session },
      );
      const set: Record<string, unknown> = { verification_status: "PENDING_REVIEW" };
      if (input.registration_number) set.registration_number = input.registration_number;
      await CompanyDocument.updateOne({ _id: companyId }, { $set: set }, { session });
      const verification = serialize<CompanyVerification>(verificationDoc);
      await recordAudit({
        actor_id: userId,
        action: "VERIFICATION_SUBMITTED",
        entity_type: "company_verification",
        entity_id: verification.id,
        metadata: {
          company_id: companyId,
          documents_count: input.documents.length,
          registration_number: input.registration_number ?? company.registration_number,
        },
        ip_address: clientIp,
      }, session);
      return verification;
    });
  }

  static async listCompanyVerifications(companyId: string): Promise<CompanyVerification[]> {
    if (!isObjectId(companyId)) return [];
    const verifications = await CompanyVerificationDocument.find({ company_id: companyId }).sort({ created_at: -1 }).lean();
    return verifications.map((verification: unknown) => serialize<CompanyVerification>(verification));
  }

  static async findVerificationById(verificationId: string): Promise<CompanyVerification | null> {
    if (!isObjectId(verificationId)) return null;
    const verification = await CompanyVerificationDocument.findById(verificationId).lean();
    return verification ? serialize<CompanyVerification>(verification) : null;
  }

  static async listPendingVerifications(): Promise<(CompanyVerification & { company_name: string; company_country?: string | null })[]> {
    const pending = await CompanyVerificationDocument.find({ status: "PENDING_REVIEW" }).sort({ created_at: 1 }).lean();
    const companyIds = pending.map((verification: any) => verification.company_id);
    const companies = await CompanyDocument.find({ _id: { $in: companyIds } }).lean();
    const byId = new Map(companies.map((company: any) => [String(company._id), company]));
    return pending.flatMap((raw: any) => {
      const verification = serialize<CompanyVerification>(raw);
      const company: any = byId.get(verification.company_id);
      return company ? [{ ...verification, company_name: company.name, company_country: company.country ?? null }] : [];
    });
  }

  static async getAdminDashboardMetrics(companyId: string): Promise<{
    total_opportunities: number;
    published_opportunities: number;
    draft_opportunities: number;
    total_views: number;
    last_3_opportunities: Array<{ id: string; title: string; status: string; views: number; created_at: Date }>;
  }> {
    if (!isObjectId(companyId)) return { total_opportunities: 0, published_opportunities: 0, draft_opportunities: 0, total_views: 0, last_3_opportunities: [] };
    const opportunities = await OpportunityDocument.find(companyIdFilter(companyId)).sort({ created_at: -1 }).lean();
    return {
      total_opportunities: opportunities.length,
      published_opportunities: opportunities.filter((item: any) => item.status === "published").length,
      draft_opportunities: opportunities.filter((item: any) => item.status === "draft").length,
      total_views: opportunities.reduce((sum: number, item: any) => sum + Number(item.views_count ?? 0), 0),
      last_3_opportunities: opportunities.slice(0, 3).map((item: any) => ({
        id: String(item._id), title: item.title, status: item.status,
        views: Number(item.views_count ?? 0), created_at: item.created_at,
      })),
    };
  }

  static async listAllPostedJobs(companyId: string) {
    if (!isObjectId(companyId)) return [];
    const opportunities = await OpportunityDocument.find(companyIdFilter(companyId)).lean();
    return opportunities.map((item: any) => {
      const result = { ...item, id: String(item._id), company_id: String(item.company_id) };
      delete result._id;
      delete result.__v;
      return result;
    });
  }

  static async decideVerification(
    verificationId: string,
    input: AdminVerificationDecisionInput,
    adminUserId: string,
    clientIp?: string,
  ): Promise<{ verification: CompanyVerification; company: Company }> {
    if (!isObjectId(verificationId)) throw new AppError("Verification record not found", 404);
    return inTransaction(async (session) => {
      const target = await CompanyVerificationDocument.findById(verificationId).session(session);
      if (!target) throw new AppError("Verification record not found", 404);
      if (target.status !== "PENDING_REVIEW") {
        throw new AppError(`Verification has already been decided: current status is ${target.status}`, 409);
      }
      const updatedVerificationDoc = await CompanyVerificationDocument.findByIdAndUpdate(
        verificationId,
        { $set: { status: input.status, reviewer_id: adminUserId, review_notes: input.review_notes ?? null, decided_at: new Date() } },
        { new: true, runValidators: true, session },
      );
      const targetCompanyStatus = input.status === "APPROVED" ? "VERIFIED" : "REJECTED";
      const updatedCompanyDoc = await CompanyDocument.findByIdAndUpdate(
        target.company_id,
        { $set: { verification_status: targetCompanyStatus } },
        { new: true, runValidators: true, session },
      );
      if (!updatedCompanyDoc) throw new AppError("Company not found", 404);
      await recordAudit({
        actor_id: adminUserId,
        action: input.status === "APPROVED" ? "COMPANY_VERIFIED" : "COMPANY_REJECTED",
        entity_type: "company_verification",
        entity_id: verificationId,
        metadata: { company_id: String(target.company_id), decision: input.status, review_notes: input.review_notes ?? null },
        ip_address: clientIp,
      }, session);
      return {
        verification: serialize<CompanyVerification>(updatedVerificationDoc),
        company: serialize<Company>(updatedCompanyDoc),
      };
    });
  }
}

