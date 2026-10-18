import assert from "node:assert/strict";
import test from "node:test";
import {
  adminVerificationDecisionSchema,
  createCompanySchema,
  inviteMemberSchema,
  memberParamSchema,
  submitVerificationSchema,
  updateCompanySchema,
  uuidParamSchema,
} from "../src/validators/company.validator.js";

test("Phase 1 - Sprint 1.2: Validation Schema Suite", async (t) => {
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
