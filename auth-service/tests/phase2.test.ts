import assert from "node:assert/strict";
import test from "node:test";
import { requireAuth } from "../src/middleware/auth.js";
import {
  requireCompanyMember,
  requireCompanyRole,
} from "../src/middleware/company-auth.js";
import { CompanyModel } from "../src/models/company.model.js";
import type { CompanyMember } from "../src/types/company.types.js";

// Mock helper for Express req, res, next
function createMockHttp(options: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  user?: any;
  companyMember?: CompanyMember;
}) {
  let statusCode = 200;
  let responseData: any = null;
  let nextCalled = false;
  let nextError: any = null;

  const req: any = {
    headers: options.headers ?? {},
    params: options.params ?? {},
    user: options.user,
    companyMember: options.companyMember,
    ip: "127.0.0.1",
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

test("Phase 2 - Sprint 2.1: Authentication & Ownership Guard", async (t) => {
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

test("Phase 2 - Sprint 2.2: Company Authorization & Role Guards", async (t) => {
  const companyId = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

  await t.test("requireCompanyMember blocks users not in the company with 403", async () => {
    // Stub CompanyModel.findMember
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

test("Phase 2 - Sprint 2.3: Role Privilege Enforcement", async (t) => {
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
