import assert from "node:assert/strict";
import test from "node:test";
import {
  decideVerification,
  listPendingVerifications,
} from "../src/controllers/admin.controller.js";
import {
  listCompanyVerifications,
  submitCompanyVerification,
} from "../src/controllers/company.controller.js";
import { requirePlatformAdmin } from "../src/middleware/auth.js";
import { requireCompanyVerified } from "../src/middleware/company-auth.js";
import { CompanyModel } from "../src/models/company.model.js";
import type { Company, CompanyVerification } from "../src/types/company.types.js";

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

test("Phase 4 - Sprint 4.1: Verification Submission Workflow (Employer)", async (t) => {
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

test("Phase 4 - Sprint 4.2: Admin Review Decisions & Audit Event Logging", async (t) => {
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

test("Phase 4 - Sprint 4.3: Feature Gating Middleware (requireCompanyVerified)", async (t) => {
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
