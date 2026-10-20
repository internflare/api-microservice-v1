import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import {
  decideVerification,
  listPendingVerifications,
} from "../src/controllers/admin.controller.js";
import {
  acceptMembershipInvite,
  createCompany,
  getCompanyById,
  inviteCompanyMember,
  listCompanyMembers,
  listCompanyVerifications,
  removeCompanyMember,
  submitCompanyVerification,
  updateCompany,
} from "../src/controllers/company.controller.js";
import {
  getCompanyAccess,
  getCompanyVerificationStatus,
} from "../src/controllers/internal.controller.js";
import { requireAuth, requirePlatformAdmin } from "../src/middleware/auth.js";
import {
  requireCompanyMember,
  requireCompanyRole,
  requireCompanyVerified,
} from "../src/middleware/company-auth.js";
import { requireInternalServiceAuth } from "../src/middleware/internal-auth.js";
import { CompanyModel } from "../src/models/company.model.js";
import type {
  Company,
  CompanyMember,
  CompanyVerification,
} from "../src/types/company.types.js";
import {
  adminVerificationDecisionSchema,
  createCompanySchema,
  inviteMemberSchema,
  memberParamSchema,
  submitVerificationSchema,
  updateCompanySchema,
  uuidParamSchema,
} from "../src/validators/company.validator.js";

// Unified mock helper for Express req, res, next
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

// ============================================================================
// SUITE 1: Validation Schema & Request Parameter Contracts
// ============================================================================
test("Suite 1: Validation Schema Contracts", async (t) => {
  await t.test("createCompanySchema should accept valid company payload", () => {
    const valid = {
      name: "Acme Corp",
      website: "https://acme.example.com",
      country: "ng", // Should be transformed to uppercase
      industry: "Technology",
      registration_number: "RC-123456",
      logo_url: "https://acme.example.com/logo.png",
    };

    const parsed = createCompanySchema.parse(valid);
    assert.equal(parsed.name, "Acme Corp");
    assert.equal(parsed.country, "NG");
    assert.equal(parsed.website, "https://acme.example.com");
  });

  await t.test("createCompanySchema should reject invalid country code", () => {
    const invalid = {
      name: "Acme Corp",
      country: "NIGERIA", // Too long, must be 2-letter ISO
    };

    assert.throws(
      () => createCompanySchema.parse(invalid),
      /Country must be a 2-letter ISO country code/,
    );
  });

  await t.test("createCompanySchema should reject short company name", () => {
    const invalid = {
      name: "A",
    };

    assert.throws(
      () => createCompanySchema.parse(invalid),
      /Company name must be at least 2 characters long/,
    );
  });

  await t.test("updateCompanySchema should allow partial updates", () => {
    const partial = {
      industry: "Finance",
    };

    const parsed = updateCompanySchema.parse(partial);
    assert.equal(parsed.industry, "Finance");
    assert.equal(parsed.name, undefined);
  });

  await t.test("inviteMemberSchema should validate roles", () => {
    const validAdmin = {
      user_id: "user-123",
      workspace_role: "ADMIN",
    };
    const validMember = {
      user_id: "user-456",
      workspace_role: "MEMBER",
    };
    const invalidRole = {
      user_id: "user-789",
      workspace_role: "SUPER_ADMIN",
    };

    assert.equal(inviteMemberSchema.parse(validAdmin).workspace_role, "ADMIN");
    assert.equal(inviteMemberSchema.parse(validMember).workspace_role, "MEMBER");
    assert.throws(() => inviteMemberSchema.parse(invalidRole));
  });

  await t.test("submitVerificationSchema requires at least one document", () => {
    const emptyDocs = {
      registration_number: "RC-123456",
      documents: [],
    };

    assert.throws(
      () => submitVerificationSchema.parse(emptyDocs),
      /At least one verification document is required/,
    );

    const validDocs = {
      registration_number: "RC-123456",
      documents: [
        {
          title: "Certificate of Incorporation",
          url: "https://storage.internflare.com/docs/cert.pdf",
          document_type: "INCORPORATION_CERTIFICATE",
        },
      ],
    };

    const parsed = submitVerificationSchema.parse(validDocs);
    assert.equal(parsed.documents.length, 1);
    assert.equal(parsed.documents[0].title, "Certificate of Incorporation");
  });

  await t.test("adminVerificationDecisionSchema accepts only APPROVED or REJECTED", () => {
    assert.equal(
      adminVerificationDecisionSchema.parse({ status: "APPROVED", review_notes: "All good" }).status,
      "APPROVED",
    );
    assert.equal(
      adminVerificationDecisionSchema.parse({ status: "REJECTED", review_notes: "Missing seal" }).status,
      "REJECTED",
    );
    assert.throws(() =>
      adminVerificationDecisionSchema.parse({ status: "MAYBE" }),
    );
  });

  await t.test("uuidParamSchema validates UUID format", () => {
    const validUUID = { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11" };
    const invalidUUID = { id: "not-a-uuid" };

    assert.equal(uuidParamSchema.parse(validUUID).id, validUUID.id);
    assert.throws(() => uuidParamSchema.parse(invalidUUID));
  });

  await t.test("memberParamSchema validates both company and member UUIDs", () => {
    const valid = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      memberId: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    };
    const invalid = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      memberId: "123-bad-id",
    };

    assert.equal(memberParamSchema.parse(valid).memberId, valid.memberId);
    assert.throws(() => memberParamSchema.parse(invalid));
  });
});

// ============================================================================
// SUITE 2: Authentication & Authorization Guards
// ============================================================================
test("Suite 2: Authentication & Ownership Guards", async (t) => {
  await t.test("requireAuth blocks requests without authentication with 401", async () => {
    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({});

    await (requireAuth as any)(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 401);
    assert.equal(getResponseData().error, "Unauthorized");
  });

  await t.test("requireAuth attaches authenticated user when valid test header provided", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";

    const { req, res, next, wasNextCalled } = createMockHttp({
      headers: {
        "x-test-user-id": "usr-founder-1",
        "x-test-user-email": "founder@internflare.com",
        "x-test-user-role": "EMPLOYER",
      },
    });

    await (requireAuth as any)(req, res, next);

    assert.equal(wasNextCalled(), true);
    assert.equal(req.user?.id, "usr-founder-1");
    assert.equal(req.user?.email, "founder@internflare.com");

    process.env.NODE_ENV = originalEnv;
  });
});

test("Suite 2: Company Authorization & Role Guards", async (t) => {
  const companyId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  await t.test("requireCompanyMember blocks users not in the company with 403", async () => {
    const originalFindMember = CompanyModel.findMember;
    CompanyModel.findMember = async () => null;

    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({
        user: { id: "usr-stranger-99", email: "stranger@example.com" },
        params: { id: companyId },
      });

    await (requireCompanyMember as any)(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 403);
    assert.equal(getResponseData().message, "You are not a member of this company");

    CompanyModel.findMember = originalFindMember;
  });

  await t.test("requireCompanyMember blocks REMOVED members with 403 (PRD §14 Access Revocation)", async () => {
    const originalFindMember = CompanyModel.findMember;
    CompanyModel.findMember = async () =>
      ({
        id: "mem-1",
        company_id: companyId,
        user_id: "usr-former-employee",
        workspace_role: "MEMBER",
        status: "REMOVED",
        removed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      }) as CompanyMember;

    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({
        user: { id: "usr-former-employee", email: "ex@example.com" },
        params: { id: companyId },
      });

    await (requireCompanyMember as any)(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 403);
    assert.match(getResponseData().message, /Access revoked/);

    CompanyModel.findMember = originalFindMember;
  });

  await t.test("requireCompanyMember blocks pending INVITED members with 403 until accepted", async () => {
    const originalFindMember = CompanyModel.findMember;
    CompanyModel.findMember = async () =>
      ({
        id: "mem-2",
        company_id: companyId,
        user_id: "usr-invited-intern",
        workspace_role: "MEMBER",
        status: "INVITED",
        created_at: new Date(),
        updated_at: new Date(),
      }) as CompanyMember;

    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({
        user: { id: "usr-invited-intern", email: "intern@example.com" },
        params: { id: companyId },
      });

    await (requireCompanyMember as any)(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 403);
    assert.match(getResponseData().message, /Membership invitation is pending acceptance/);

    CompanyModel.findMember = originalFindMember;
  });

  await t.test("requireCompanyMember allows ACTIVE members and attaches companyMember context", async () => {
    const originalFindMember = CompanyModel.findMember;
    const mockMember: CompanyMember = {
      id: "mem-3",
      company_id: companyId,
      user_id: "usr-active-member",
      workspace_role: "MEMBER",
      status: "ACTIVE",
      joined_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
    CompanyModel.findMember = async () => mockMember;

    const { req, res, next, wasNextCalled } = createMockHttp({
      user: { id: "usr-active-member", email: "active@example.com" },
      params: { id: companyId },
    });

    await (requireCompanyMember as any)(req, res, next);

    assert.equal(wasNextCalled(), true);
    assert.deepEqual(req.companyMember, mockMember);

    CompanyModel.findMember = originalFindMember;
  });
});

test("Suite 2: Role Privilege Enforcement", async (t) => {
  await t.test("requireCompanyRole blocks regular MEMBER from ADMIN operations with 403", () => {
    const guard = requireCompanyRole(["ADMIN"]);
    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({
        companyMember: {
          id: "mem-1",
          company_id: "comp-1",
          user_id: "user-1",
          workspace_role: "MEMBER",
          status: "ACTIVE",
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

    guard(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 403);
    assert.match(getResponseData().message, /Action requires one of the following roles: ADMIN/);
  });

  await t.test("requireCompanyRole allows ADMIN role through", () => {
    const guard = requireCompanyRole(["ADMIN"]);
    const { req, res, next, wasNextCalled } = createMockHttp({
      companyMember: {
        id: "mem-2",
        company_id: "comp-1",
        user_id: "user-admin",
        workspace_role: "ADMIN",
        status: "ACTIVE",
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    guard(req, res, next);

    assert.equal(wasNextCalled(), true);
  });
});

// ============================================================================
// SUITE 3: Company & Member Lifecycle Operations
// ============================================================================
test("Suite 3: Company Lifecycle Operations", async (t) => {
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

test("Suite 3: Member Management Operations", async (t) => {
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

// ============================================================================
// SUITE 4: Verification Submission, Review Decisions & Feature Gating
// ============================================================================
test("Suite 4: Verification Submission Workflow (Employer)", async (t) => {
  const companyId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  const mockVerification: CompanyVerification = {
    id: "ver-1234-uuid",
    company_id: companyId,
    status: "PENDING_REVIEW",
    reviewer_id: null,
    review_notes: null,
    documents: [
      {
        title: "Certificate of Incorporation",
        url: "https://storage.internflare.com/docs/cert.pdf",
        uploaded_at: new Date().toISOString(),
      },
    ],
    created_at: new Date(),
    decided_at: null,
  };

  await t.test("submitCompanyVerification submits documents and returns 201 with PENDING_REVIEW", async () => {
    const originalSubmit = CompanyModel.submitVerification;
    CompanyModel.submitVerification = async () => mockVerification;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-founder-1", role: "USER" },
      params: { id: companyId },
      body: {
        registration_number: "RC-998877",
        documents: [
          {
            title: "Certificate of Incorporation",
            url: "https://storage.internflare.com/docs/cert.pdf",
          },
        ],
      },
    });

    await (submitCompanyVerification as any)(req, res, next);

    assert.equal(getStatusCode(), 201);
    assert.equal(getResponseData().message, "Verification documents submitted successfully");
    assert.equal(getResponseData().verification.status, "PENDING_REVIEW");

    CompanyModel.submitVerification = originalSubmit;
  });

  await t.test("submitCompanyVerification rejects unauthenticated requests with 401", async () => {
    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: undefined,
      params: { id: companyId },
      body: { documents: [] },
    });

    await (submitCompanyVerification as any)(req, res, next);

    assert.equal(getStatusCode(), 401);
    assert.equal(getResponseData().error, "Unauthorized");
  });

  await t.test("submitCompanyVerification returns 404 if company does not exist", async () => {
    const originalSubmit = CompanyModel.submitVerification;
    CompanyModel.submitVerification = async () => {
      throw new Error("Company not found");
    };

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-founder-1" },
      params: { id: "missing-company-id" },
      body: {
        documents: [{ title: "Doc", url: "https://example.com/doc.pdf" }],
      },
    });

    await (submitCompanyVerification as any)(req, res, next);

    assert.equal(getStatusCode(), 404);
    assert.equal(getResponseData().error, "Not Found");

    CompanyModel.submitVerification = originalSubmit;
  });

  await t.test("listCompanyVerifications returns 200 with submission history", async () => {
    const originalList = CompanyModel.listCompanyVerifications;
    CompanyModel.listCompanyVerifications = async () => [mockVerification];

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-founder-1" },
      params: { id: companyId },
    });

    await (listCompanyVerifications as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().verifications.length, 1);
    assert.equal(getResponseData().verifications[0].id, mockVerification.id);

    CompanyModel.listCompanyVerifications = originalList;
  });
});

test("Suite 4: Admin Review Decisions & Audit Event Logging", async (t) => {
  const companyId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const verificationId = "ver-1234-uuid";

  const mockCompany: Company = {
    id: companyId,
    name: "Acme Technologies",
    verification_status: "VERIFIED",
    created_by: "usr-founder-1",
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockApprovedVerification: CompanyVerification = {
    id: verificationId,
    company_id: companyId,
    status: "APPROVED",
    reviewer_id: "usr-platform-admin",
    review_notes: "CAC verified and registration valid",
    documents: [],
    created_at: new Date(),
    decided_at: new Date(),
  };

  await t.test("requirePlatformAdmin blocks non-admin users with 403 Forbidden", () => {
    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({
        user: { id: "usr-regular-user", role: "USER" },
      });

    requirePlatformAdmin(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 403);
    assert.match(getResponseData().message, /Platform administrator access required/);
  });

  await t.test("requirePlatformAdmin allows ADMIN and SUPER_ADMIN users through", () => {
    const { req, res, next, wasNextCalled } = createMockHttp({
      user: { id: "usr-superadmin", role: "SUPER_ADMIN" },
    });

    requirePlatformAdmin(req, res, next);

    assert.equal(wasNextCalled(), true);
  });

  await t.test("listPendingVerifications returns 200 with list of pending requests", async () => {
    const originalList = CompanyModel.listPendingVerifications;
    CompanyModel.listPendingVerifications = async () => [
      {
        ...mockApprovedVerification,
        status: "PENDING_REVIEW",
        company_name: "Acme Technologies",
        company_country: "NG",
      },
    ];

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-admin", role: "ADMIN" },
    });

    await (listPendingVerifications as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().pending_verifications.length, 1);
    assert.equal(getResponseData().pending_verifications[0].company_name, "Acme Technologies");

    CompanyModel.listPendingVerifications = originalList;
  });

  await t.test("decideVerification records approval decision and returns 200", async () => {
    const originalDecide = CompanyModel.decideVerification;
    CompanyModel.decideVerification = async () => ({
      verification: mockApprovedVerification,
      company: mockCompany,
    });

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-platform-admin", role: "ADMIN" },
      params: { id: verificationId },
      body: {
        status: "APPROVED",
        review_notes: "CAC verified and registration valid",
      },
    });

    await (decideVerification as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.match(getResponseData().message, /Verification decision recorded: APPROVED/);
    assert.equal(getResponseData().verification.status, "APPROVED");
    assert.equal(getResponseData().company.verification_status, "VERIFIED");

    CompanyModel.decideVerification = originalDecide;
  });

  await t.test("decideVerification returns 404 when verification does not exist", async () => {
    const originalDecide = CompanyModel.decideVerification;
    CompanyModel.decideVerification = async () => {
      throw new Error("Verification record not found");
    };

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-platform-admin", role: "ADMIN" },
      params: { id: "non-existent-id" },
      body: { status: "REJECTED" },
    });

    await (decideVerification as any)(req, res, next);

    assert.equal(getStatusCode(), 404);
    assert.equal(getResponseData().error, "Not Found");

    CompanyModel.decideVerification = originalDecide;
  });

  await t.test("decideVerification returns 409 Conflict when verification was already decided", async () => {
    const originalDecide = CompanyModel.decideVerification;
    CompanyModel.decideVerification = async () => {
      throw new Error("Verification has already been decided: current status is APPROVED");
    };

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      user: { id: "usr-platform-admin", role: "ADMIN" },
      params: { id: verificationId },
      body: { status: "REJECTED" },
    });

    await (decideVerification as any)(req, res, next);

    assert.equal(getStatusCode(), 409);
    assert.equal(getResponseData().error, "Conflict");
    assert.match(getResponseData().message, /already been decided/);

    CompanyModel.decideVerification = originalDecide;
  });
});

test("Suite 4: Feature Gating Middleware (requireCompanyVerified)", async (t) => {
  const companyId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  await t.test("requireCompanyVerified returns 400 if no company ID is present", async () => {
    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({});

    await (requireCompanyVerified as any)(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 400);
    assert.equal(getResponseData().error, "Bad Request");
  });

  await t.test("requireCompanyVerified returns 404 if company is not found", async () => {
    const originalFind = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async () => null;

    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({ params: { id: companyId } });

    await (requireCompanyVerified as any)(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 404);
    assert.equal(getResponseData().error, "Not Found");

    CompanyModel.findCompanyById = originalFind;
  });

  await t.test("requireCompanyVerified blocks UNVERIFIED company with 403 Forbidden", async () => {
    const originalFind = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async () =>
      ({
        id: companyId,
        name: "Unverified Co",
        verification_status: "UNVERIFIED",
      }) as Company;

    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({ params: { id: companyId } });

    await (requireCompanyVerified as any)(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 403);
    assert.match(getResponseData().message, /Company verification required/);

    CompanyModel.findCompanyById = originalFind;
  });

  await t.test("requireCompanyVerified blocks PENDING_REVIEW company with 403 Forbidden", async () => {
    const originalFind = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async () =>
      ({
        id: companyId,
        name: "Pending Co",
        verification_status: "PENDING_REVIEW",
      }) as Company;

    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({ params: { id: companyId } });

    await (requireCompanyVerified as any)(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 403);
    assert.match(getResponseData().message, /Company verification required/);

    CompanyModel.findCompanyById = originalFind;
  });

  await t.test("requireCompanyVerified allows VERIFIED company through", async () => {
    const originalFind = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async () =>
      ({
        id: companyId,
        name: "Verified Co",
        verification_status: "VERIFIED",
      }) as Company;

    const { req, res, next, wasNextCalled } = createMockHttp({
      params: { id: companyId },
    });

    await (requireCompanyVerified as any)(req, res, next);

    assert.equal(wasNextCalled(), true);

    CompanyModel.findCompanyById = originalFind;
  });
});

// ============================================================================
// SUITE 5: Internal Cross-Service Integration & Remote RPC
// ============================================================================
test("Suite 5: Cross-Service Authentication & Internal Security", async (t) => {
  await t.test("requireInternalServiceAuth blocks requests without x-internal-service-key with 401", () => {
    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({});

    requireInternalServiceAuth(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 401);
    assert.match(getResponseData().message, /Missing x-internal-service-key header/);
  });

  await t.test("requireInternalServiceAuth blocks requests with invalid key with 401", () => {
    const { req, res, next, getStatusCode, getResponseData, wasNextCalled } =
      createMockHttp({
        headers: { "x-internal-service-key": "wrong-key" },
      });

    requireInternalServiceAuth(req, res, next);

    assert.equal(wasNextCalled(), false);
    assert.equal(getStatusCode(), 401);
    assert.match(getResponseData().message, /Invalid internal service credentials/);
  });

  await t.test("requireInternalServiceAuth allows requests with valid key through", () => {
    const { req, res, next, wasNextCalled } = createMockHttp({
      headers: { "x-internal-service-key": config.internalServiceSecret },
    });

    requireInternalServiceAuth(req, res, next);

    assert.equal(wasNextCalled(), true);
  });
});

test("Suite 5: Cross-Service Permissions & Access Inspection", async (t) => {
  const companyId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
  const userId = "usr-worker-1";

  const mockVerifiedCompany: Company = {
    id: companyId,
    name: "Acme Technologies",
    country: "NG",
    verification_status: "VERIFIED",
    created_by: "usr-founder-1",
    created_at: new Date(),
    updated_at: new Date(),
  };

  await t.test("getCompanyAccess returns 404 when company does not exist", async () => {
    const originalFindCompany = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async () => null;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      params: { id: "missing-id", userId },
    });

    await (getCompanyAccess as any)(req, res, next);

    assert.equal(getStatusCode(), 404);
    assert.equal(getResponseData().error, "Not Found");

    CompanyModel.findCompanyById = originalFindCompany;
  });

  await t.test("getCompanyAccess returns has_access: true for active member", async () => {
    const originalFindCompany = CompanyModel.findCompanyById;
    const originalFindMember = CompanyModel.findMember;

    CompanyModel.findCompanyById = async () => mockVerifiedCompany;
    CompanyModel.findMember = async () =>
      ({
        id: "mem-active",
        company_id: companyId,
        user_id: userId,
        workspace_role: "ADMIN",
        status: "ACTIVE",
        joined_at: new Date(),
      }) as CompanyMember;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      params: { id: companyId, userId },
    });

    await (getCompanyAccess as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().has_access, true);
    assert.equal(getResponseData().company.is_verified, true);
    assert.equal(getResponseData().membership.status, "ACTIVE");
    assert.equal(getResponseData().membership.workspace_role, "ADMIN");

    CompanyModel.findCompanyById = originalFindCompany;
    CompanyModel.findMember = originalFindMember;
  });

  await t.test("getCompanyAccess returns has_access: false for REMOVED member (PRD §14)", async () => {
    const originalFindCompany = CompanyModel.findCompanyById;
    const originalFindMember = CompanyModel.findMember;

    CompanyModel.findCompanyById = async () => mockVerifiedCompany;
    CompanyModel.findMember = async () =>
      ({
        id: "mem-removed",
        company_id: companyId,
        user_id: userId,
        workspace_role: "MEMBER",
        status: "REMOVED",
        removed_at: new Date(),
      }) as CompanyMember;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      params: { id: companyId, userId },
    });

    await (getCompanyAccess as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().has_access, false);
    assert.equal(getResponseData().membership.status, "REMOVED");

    CompanyModel.findCompanyById = originalFindCompany;
    CompanyModel.findMember = originalFindMember;
  });

  await t.test("getCompanyAccess returns has_access: false and membership: null for non-member", async () => {
    const originalFindCompany = CompanyModel.findCompanyById;
    const originalFindMember = CompanyModel.findMember;

    CompanyModel.findCompanyById = async () => mockVerifiedCompany;
    CompanyModel.findMember = async () => null;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      params: { id: companyId, userId },
    });

    await (getCompanyAccess as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().has_access, false);
    assert.equal(getResponseData().membership, null);

    CompanyModel.findCompanyById = originalFindCompany;
    CompanyModel.findMember = originalFindMember;
  });

  await t.test("getCompanyVerificationStatus returns is_verified true for VERIFIED company", async () => {
    const originalFindCompany = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async () => mockVerifiedCompany;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      params: { id: companyId },
    });

    await (getCompanyVerificationStatus as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().is_verified, true);
    assert.equal(getResponseData().verification_status, "VERIFIED");

    CompanyModel.findCompanyById = originalFindCompany;
  });

  await t.test("getCompanyVerificationStatus returns is_verified false for UNVERIFIED company", async () => {
    const originalFindCompany = CompanyModel.findCompanyById;
    CompanyModel.findCompanyById = async () =>
      ({
        ...mockVerifiedCompany,
        verification_status: "UNVERIFIED",
      }) as Company;

    const { req, res, next, getStatusCode, getResponseData } = createMockHttp({
      params: { id: companyId },
    });

    await (getCompanyVerificationStatus as any)(req, res, next);

    assert.equal(getStatusCode(), 200);
    assert.equal(getResponseData().is_verified, false);
    assert.equal(getResponseData().verification_status, "UNVERIFIED");

    CompanyModel.findCompanyById = originalFindCompany;
  });
});
