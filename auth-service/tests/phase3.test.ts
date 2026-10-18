import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptMembershipInvite,
  createCompany,
  getCompanyById,
  inviteCompanyMember,
  listCompanyMembers,
  removeCompanyMember,
  updateCompany,
} from "../src/controllers/company.controller.js";
import { CompanyModel } from "../src/models/company.model.js";
import type { Company, CompanyMember } from "../src/types/company.types.js";

function createMockHttp(options: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: any;
  user?: any;
  companyMember?: CompanyMember;
  ip?: string;
}) {
  let statusCode = 200;
  let responseData: any = null;
  let nextCalled = false;
  let nextError: any = null;

  const req: any = {
    headers: options.headers ?? {},
    params: options.params ?? {},
    body: options.body ?? {},
    user: options.user,
    companyMember: options.companyMember,
    ip: options.ip ?? "127.0.0.1",
  };

  const res: any = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(data: any) {
      responseData = data;
      return res;
    },
  };

  const next = (err?: any) => {
    nextCalled = true;
    nextError = err;
  };

  return {
    req,
    res,
    next,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
    wasNextCalled: () => nextCalled,
    getNextError: () => nextError,
  };
}

test("Phase 3 - Sprint 3.1: Company Lifecycle Operations", async (t) => {
  const mockCompany: Company = {
    id: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    name: "Acme Technologies",
    website: "https://acme.example.com",
    country: "NG",
    industry: "Fintech",
    registration_number: "RC-998877",
    logo_url: "https://acme.example.com/logo.png",
    verification_status: "UNVERIFIED",
    created_by: "usr-founder-1",
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };

  const mockAdminMember: CompanyMember = {
    id: "mem-founder-1",
    company_id: mockCompany.id,
    user_id: "usr-founder-1",
    workspace_role: "ADMIN",
    status: "ACTIVE",
    joined_at: new Date(),
    removed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await t.test("createCompany creates organization and returns 201 with creator as ADMIN", async () => {
    const originalCreate = CompanyModel.createCompanyWithAdmin;
    CompanyModel.createCompanyWithAdmin = async () => ({
      company: mockCompany,
      member: mockAdminMember,
    });

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-founder-1" },
      body: {
        name: "Acme Technologies",
        website: "https://acme.example.com",
        country: "NG",
        industry: "Fintech",
      },
    });

    await (createCompany as any)(req, res, next);

    assert.equal(getStatusCode(), 201);
    assert.equal(getResponseData().message, "Company created successfully");
    assert.deepEqual(getResponseData().company, mockCompany);
    assert.equal(getResponseData().member.workspace_role, "ADMIN");
    assert.equal(getResponseData().member.status, "ACTIVE");

    CompanyModel.createCompanyWithAdmin = originalCreate;
  });

  await t.test("createCompany rejects unauthenticated request with 401", async () => {
    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: undefined,
      body: { name: "No Auth Inc" },
    });

    await (createCompany as any)(req, res, next);

    assert.equal(getStatusCode(), 401);
    assert.equal(getResponseData().error, "Unauthorized");
  });

  await t.test("getCompanyById returns 200 with company details when found", async () => {
    const originalFind = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async (id: string) =>
      id === mockCompany.id ? mockCompany : null;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-founder-1" },
      params: { id: mockCompany.id },
    });

    await (getCompanyById as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.deepEqual(getResponseData().company, mockCompany);

    CompanyModel.findCompanyById = originalFind;
  });

  await t.test("getCompanyById returns 404 when company does not exist", async () => {
    const originalFind = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async () => null;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-founder-1" },
      params: { id: "non-existent-id" },
    });

    await (getCompanyById as any)(req, res, next);

    assert.equal(getStatusCode(), 404);
    assert.equal(getResponseData().error, "Not Found");

    CompanyModel.findCompanyById = originalFind;
  });

  await t.test("updateCompany updates profile and returns 200", async () => {
    const originalUpdate = CompanyModel.updateCompany;
    const updatedCompany = { ...mockCompany, industry: "Healthtech" };
    CompanyModel.updateCompany = async () => updatedCompany;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-founder-1" },
      params: { id: mockCompany.id },
      body: { industry: "Healthtech" },
    });

    await (updateCompany as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().message, "Company updated successfully");
    assert.equal(getResponseData().company.industry, "Healthtech");

    CompanyModel.updateCompany = originalUpdate;
  });

  await t.test("updateCompany returns 404 if target company not found", async () => {
    const originalUpdate = CompanyModel.updateCompany;
    CompanyModel.updateCompany = async () => null;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-founder-1" },
      params: { id: "missing-id" },
      body: { name: "Updated Name" },
    });

    await (updateCompany as any)(req, res, next);

    assert.equal(getStatusCode(), 404);
    assert.equal(getResponseData().error, "Not Found");

    CompanyModel.updateCompany = originalUpdate;
  });
});

test("Phase 3 - Sprint 3.2: Member Management Operations", async (t) => {
  const companyId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  const mockInvitedMember: CompanyMember = {
    id: "mem-invite-1",
    company_id: companyId,
    user_id: "usr-intern-1",
    workspace_role: "MEMBER",
    status: "INVITED",
    joined_at: null,
    removed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await t.test("inviteCompanyMember creates invitation with status INVITED", async () => {
    const originalInvite = CompanyModel.inviteMember;
    CompanyModel.inviteMember = async () => mockInvitedMember;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-admin-1" },
      params: { id: companyId },
      body: { user_id: "usr-intern-1", workspace_role: "MEMBER" },
    });

    await (inviteCompanyMember as any)(req, res, next);

    assert.equal(getStatusCode(), 201);
    assert.equal(getResponseData().message, "Member invited successfully");
    assert.equal(getResponseData().member.status, "INVITED");

    CompanyModel.inviteMember = originalInvite;
  });

  await t.test("inviteCompanyMember returns 409 Conflict when user already has active/pending membership", async () => {
    const originalInvite = CompanyModel.inviteMember;
    CompanyModel.inviteMember = async () => {
      throw new Error("User is already an active member of this company");
    };

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-admin-1" },
      params: { id: companyId },
      body: { user_id: "usr-intern-1", workspace_role: "MEMBER" },
    });

    await (inviteCompanyMember as any)(req, res, next);

    assert.equal(getStatusCode(), 409);
    assert.equal(getResponseData().error, "Conflict");
    assert.match(getResponseData().message, /already an active member/);

    CompanyModel.inviteMember = originalInvite;
  });

  await t.test("listCompanyMembers returns 200 with list of team members", async () => {
    const originalList = CompanyModel.listMembers;
    CompanyModel.listMembers = async () => [mockInvitedMember];

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-admin-1" },
      params: { id: companyId },
    });

    await (listCompanyMembers as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().members.length, 1);
    assert.equal(getResponseData().members[0].id, mockInvitedMember.id);

    CompanyModel.listMembers = originalList;
  });

  await t.test("acceptMembershipInvite transitions status to ACTIVE", async () => {
    const originalAccept = CompanyModel.acceptInvite;
    const acceptedMember: CompanyMember = {
      ...mockInvitedMember,
      status: "ACTIVE",
      joined_at: new Date(),
    };
    CompanyModel.acceptInvite = async () => acceptedMember;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-intern-1" },
      params: { id: companyId },
    });

    await (acceptMembershipInvite as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().message, "Invitation accepted successfully");
    assert.equal(getResponseData().member.status, "ACTIVE");
    assert.ok(getResponseData().member.joined_at);

    CompanyModel.acceptInvite = originalAccept;
  });

  await t.test("acceptMembershipInvite returns 404 if no invitation exists", async () => {
    const originalAccept = CompanyModel.acceptInvite;
    CompanyModel.acceptInvite = async () => null;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-stranger-1" },
      params: { id: companyId },
    });

    await (acceptMembershipInvite as any)(req, res, next);

    assert.equal(getStatusCode(), 404);
    assert.equal(getResponseData().error, "Not Found");

    CompanyModel.acceptInvite = originalAccept;
  });

  await t.test("removeCompanyMember soft-removes member with REMOVED status (PRD §14)", async () => {
    const originalSoftRemove = CompanyModel.softRemoveMember;
    const removedMember: CompanyMember = {
      ...mockInvitedMember,
      status: "REMOVED",
      removed_at: new Date(),
    };
    CompanyModel.softRemoveMember = async () => removedMember;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-admin-1" },
      params: { id: companyId, memberId: mockInvitedMember.id },
    });

    await (removeCompanyMember as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.match(getResponseData().message, /Member access revoked successfully without deleting records/);
    assert.equal(getResponseData().member.status, "REMOVED");
    assert.ok(getResponseData().member.removed_at);

    CompanyModel.softRemoveMember = originalSoftRemove;
  });

  await t.test("removeCompanyMember blocks removal of the sole active administrator with 400", async () => {
    const originalSoftRemove = CompanyModel.softRemoveMember;
    CompanyModel.softRemoveMember = async () => {
      throw new Error("Cannot remove the sole active administrator of a company");
    };

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-admin-1" },
      params: { id: companyId, memberId: "sole-admin-id" },
    });

    await (removeCompanyMember as any)(req, res, next);

    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().error, "Bad Request");
    assert.match(getResponseData().message, /Cannot remove the sole active administrator/);

    CompanyModel.softRemoveMember = originalSoftRemove;
  });
});
