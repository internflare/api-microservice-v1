import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../src/config.js";
import {
  getCompanyAccess,
  getCompanyVerificationStatus,
} from "../src/controllers/internal.controller.js";
import { requireInternalServiceAuth } from "../src/middleware/internal-auth.js";
import { CompanyModel } from "../src/models/company.model.js";
import type { Company, CompanyMember } from "../src/types/company.types.js";

function createMockHttp(options: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  body?: any;
  user?: any;
  companyMember?: any;
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

test("Phase 5 - Sprint 5.1: Cross-Service Authentication & Internal Security", async (t) => {
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

test("Phase 5 - Sprint 5.1: Cross-Service Permissions & Access Inspection", async (t) => {
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
