import assert from "node:assert/strict";
import test from "node:test";
import { TalentController } from "../src/controllers/talent.controller.js";
import { requireAuth } from "../src/middleware/auth.js";
import { TalentModel } from "../src/models/talent.model.js";
import { pool } from "../src/db/pool.js";
import { openApiDocument } from "../src/docs/openapi.js";
import { calculateProfileCompleteness } from "../src/services/completeness.service.js";
import type {
  TalentProfile,
  TalentProfileInput,
} from "../src/types/talent.types.js";
import {
  CreateTalentProfileSchema,
  UpdateTalentProfileSchema,
  TalentSearchQuerySchema,
  EducationItemSchema,
  ExperienceItemSchema,
} from "../src/validators/talent.validator.js";

// Express request/response test helper.
function createMockHttp(options: {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
  user?: any;
  ip?: string;
}) {
  let statusCode = 200;
  let responseData: any = null;
  let nextCalled = false;
  let nextError: any = null;

  const req: any = {
    headers: options.headers ?? {},
    params: options.params ?? {},
    query: options.query ?? {},
    body: options.body ?? {},
    user: options.user,
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

// Sample complete profile input
const sampleCompleteProfile: TalentProfileInput = {
  full_name: "Jane Developer",
  headline: "Senior Backend Engineer",
  phone: "+1234567890",
  country: "United States",
  location: "San Francisco, CA",
  skills: ["TypeScript", "Node.js", "PostgreSQL", "Docker"],
  preferred_roles: ["Backend Engineer", "Software Architect"],
  education: [
    {
      institution: "MIT",
      degree: "B.S. in Computer Science",
      field_of_study: "Software Systems",
      start_year: 2018,
      end_year: 2022,
    },
  ],
  experience: [
    {
      company: "Tech Corp",
      title: "Senior Engineer",
      location: "San Francisco",
      start_date: "2022-06",
      current: true,
      description: "Building scalable distributed services",
    },
  ],
  availability: "immediate",
  work_arrangement_pref: "remote",
  career_goals: "Passionate about high-throughput microservices and distributed databases.",
  cv_url: "https://storage.internflare.com/cvs/jane_cv.pdf",
};

// ============================================================================
// SUITE 1: Pure Completeness Calculation Engine (PRD §4.1 / US-01)
// ============================================================================
test("Suite 1: Profile Completeness Calculation Engine", async (t) => {
  await t.test("empty profile should yield 0% score and all missing fields", () => {
    const result = calculateProfileCompleteness({});
    assert.equal(result.score, 0);
    assert.ok(result.missing_fields.length > 0);
    assert.ok(result.next_prompt !== null);
    assert.equal(result.breakdown.basic_info, 0);
    assert.equal(result.breakdown.skills, 0);
    assert.equal(result.breakdown.education, 0);
    assert.equal(result.breakdown.experience, 0);
  });

  await t.test("profile with basic info only should yield 15%", () => {
    const result = calculateProfileCompleteness({
      full_name: "Alex Smith",
      headline: "Frontend Specialist",
    });
    assert.equal(result.breakdown.basic_info, 15);
    assert.equal(result.score, 15);
  });

  await t.test("contact and location should award 15%", () => {
    const result = calculateProfileCompleteness({
      phone: "+447911123456",
      country: "United Kingdom",
      location: "London",
    });
    assert.equal(result.breakdown.contact_location, 15);
    assert.equal(result.score, 15);
  });

  await t.test("skills weighting: 1 skill -> 5%, 2 skills -> 10%, >= 3 skills -> 15%", () => {
    const oneSkill = calculateProfileCompleteness({ skills: ["TypeScript"] });
    assert.equal(oneSkill.breakdown.skills, 5);

    const twoSkills = calculateProfileCompleteness({ skills: ["TypeScript", "Node.js"] });
    assert.equal(twoSkills.breakdown.skills, 10);

    const threeSkills = calculateProfileCompleteness({
      skills: ["TypeScript", "Node.js", "PostgreSQL"],
    });
    assert.equal(threeSkills.breakdown.skills, 15);
  });

  await t.test("preferred roles should award 10% when >= 1 role present", () => {
    const withRoles = calculateProfileCompleteness({ preferred_roles: ["Backend Dev"] });
    assert.equal(withRoles.breakdown.preferred_roles, 10);

    const emptyRoles = calculateProfileCompleteness({ preferred_roles: [] });
    assert.equal(emptyRoles.breakdown.preferred_roles, 0);
  });

  await t.test("education and experience should each award 15%", () => {
    const withEdu = calculateProfileCompleteness({
      education: [{ institution: "Stanford", degree: "M.S." }],
    });
    assert.equal(withEdu.breakdown.education, 15);

    const withExp = calculateProfileCompleteness({
      experience: [{ company: "Google", title: "SWE" }],
    });
    assert.equal(withExp.breakdown.experience, 15);
  });

  await t.test("preferences and career goals should award 10%", () => {
    const withPrefs = calculateProfileCompleteness({
      availability: "immediate",
      work_arrangement_pref: "remote",
      career_goals: "Looking to lead impactful open-source and backend engineering projects.",
    });
    assert.equal(withPrefs.breakdown.preferences_goals, 10);
  });

  await t.test("valid CV URL awards 5%", () => {
    const withCv = calculateProfileCompleteness({
      cv_url: "https://cdn.example.com/cv.pdf",
    });
    assert.equal(withCv.breakdown.cv_url, 5);
  });

  await t.test("complete profile awards 100% and empty missing fields", () => {
    const result = calculateProfileCompleteness(sampleCompleteProfile);
    assert.equal(result.score, 100);
    assert.equal(result.missing_fields.length, 0);
    assert.equal(result.next_prompt, null);
  });
});

// ============================================================================
// SUITE 2: Validation Schemas & Request Contracts
// ============================================================================
test("Suite 2: Zod Validation Contracts", async (t) => {
  await t.test("EducationItemSchema requires institution and degree", () => {
    const valid = EducationItemSchema.safeParse({
      institution: "Harvard",
      degree: "B.A.",
    });
    assert.equal(valid.success, true);

    const invalid = EducationItemSchema.safeParse({
      institution: "",
      degree: "B.A.",
    });
    assert.equal(invalid.success, false);
  });

  await t.test("ExperienceItemSchema requires company and title", () => {
    const valid = ExperienceItemSchema.safeParse({
      company: "Acme Inc",
      title: "Fullstack Dev",
    });
    assert.equal(valid.success, true);

    const invalid = ExperienceItemSchema.safeParse({
      company: "Acme Inc",
      title: "",
    });
    assert.equal(invalid.success, false);
  });

  await t.test("CreateTalentProfileSchema accepts full payload", () => {
    const result = CreateTalentProfileSchema.safeParse(sampleCompleteProfile);
    assert.equal(result.success, true);
  });

  await t.test("UpdateTalentProfileSchema accepts partial payload", () => {
    const result = UpdateTalentProfileSchema.safeParse({
      skills: ["Rust", "Go"],
      headline: "Distributed Systems Engineer",
    });
    assert.equal(result.success, true);
  });

  await t.test("TalentSearchQuerySchema parses query parameters with defaults", () => {
    const result = TalentSearchQuerySchema.safeParse({
      country: "US",
      limit: "15",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.limit, 15);
      assert.equal(result.data.offset, 0);
    }
  });
});

// ============================================================================
// SUITE 3: Auth Guard Middleware
// ============================================================================
test("Suite 3: Authentication Middleware", async (t) => {
  await t.test("requireAuth bypasses if req.user is already set", async () => {
    const mock = createMockHttp({
      user: { id: "user-123", email: "user@test.com" },
    });
    await requireAuth(mock.req, mock.res, mock.next);
    assert.equal(mock.wasNextCalled(), true);
  });

  await t.test("requireAuth supports x-test-user-id in test environment", async () => {
    const mock = createMockHttp({
      headers: {
        "x-test-user-id": "test-uuid-456",
        "x-test-user-email": "talent@internflare.com",
        "x-test-user-role": "TALENT",
      },
    });
    await requireAuth(mock.req, mock.res, mock.next);
    assert.equal(mock.wasNextCalled(), true);
    assert.equal(mock.req.user.id, "test-uuid-456");
    assert.equal(mock.req.user.email, "talent@internflare.com");
  });

  await t.test("requireAuth returns 401 when no auth header or cookie present in non-test mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const mock = createMockHttp({});
      await requireAuth(mock.req, mock.res, mock.next);
      assert.equal(mock.getStatusCode(), 401);
      assert.equal(mock.getResponseData().success, false);
      assert.equal(mock.getResponseData().error, "Unauthorized");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

// ============================================================================
// SUITE 4: Talent Controller Endpoints
// ============================================================================
test("Suite 4: Talent Controller Endpoints", async (t) => {
  const mockUserId = "11111111-2222-3333-4444-555555555555";
  const mockProfileId = "99999999-8888-7777-6666-555555555555";

  const mockDbProfile: TalentProfile = {
    id: mockProfileId,
    user_id: mockUserId,
    full_name: "Jane Developer",
    headline: "Senior Backend Engineer",
    phone: "+1234567890",
    country: "United States",
    location: "San Francisco, CA",
    skills: ["TypeScript", "Node.js", "PostgreSQL", "Docker"],
    preferred_roles: ["Backend Engineer"],
    education: [
      {
        institution: "MIT",
        degree: "B.S.",
        field_of_study: "CS",
        start_year: 2018,
        end_year: 2022,
      },
    ],
    experience: [
      {
        company: "Tech Corp",
        title: "Senior Engineer",
        current: true,
      },
    ],
    availability: "immediate",
    work_arrangement_pref: "remote",
    career_goals: "Passionate about high-throughput microservices and distributed databases.",
    cv_url: "https://storage.internflare.com/cvs/jane_cv.pdf",
    profile_completeness: 100,
    readiness_score: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await t.test("POST /api/v1/talent/profile - 401 when unauthorized", async () => {
    const mock = createMockHttp({ body: sampleCompleteProfile });
    await TalentController.upsertMyProfile(mock.req, mock.res, mock.next);
    assert.equal(mock.getStatusCode(), 401);
  });

  await t.test("POST /api/v1/talent/profile - 400 when invalid payload", async () => {
    const mock = createMockHttp({
      user: { id: mockUserId },
      body: {
        education: [{ institution: "" }], // missing degree & empty institution
      },
    });
    await TalentController.upsertMyProfile(mock.req, mock.res, mock.next);
    assert.equal(mock.getStatusCode(), 400);
    assert.equal(mock.getResponseData().success, false);
    assert.equal(mock.getResponseData().error, "Validation Error");
  });

  await t.test("POST /api/v1/talent/profile - 200 on valid create/upsert", async () => {
    // Stub TalentModel.upsertProfile
    const origUpsert = TalentModel.upsertProfile;
    TalentModel.upsertProfile = async () => mockDbProfile;

    try {
      const mock = createMockHttp({
        user: { id: mockUserId },
        body: sampleCompleteProfile,
      });
      await TalentController.upsertMyProfile(mock.req, mock.res, mock.next);
      assert.equal(mock.getStatusCode(), 200);
      assert.equal(mock.getResponseData().success, true);
      assert.ok(mock.getResponseData().data.profile);
      assert.equal(mock.getResponseData().data.profile.full_name, "Jane Developer");
      assert.equal(mock.getResponseData().data.completeness.score, 100);
    } finally {
      TalentModel.upsertProfile = origUpsert;
    }
  });

  await t.test("GET /api/v1/talent/profile/me - 404 when profile not found with onboarding banner", async () => {
    const origFindByUserId = TalentModel.findByUserId;
    TalentModel.findByUserId = async () => null;

    try {
      const mock = createMockHttp({ user: { id: mockUserId } });
      await TalentController.getMyProfile(mock.req, mock.res, mock.next);
      assert.equal(mock.getStatusCode(), 404);
      assert.equal(mock.getResponseData().success, false);
      assert.ok(mock.getResponseData().completeness);
      assert.equal(mock.getResponseData().completeness.score, 0);
    } finally {
      TalentModel.findByUserId = origFindByUserId;
    }
  });

  await t.test("GET /api/v1/talent/profile/me - 200 when profile exists", async () => {
    const origFindByUserId = TalentModel.findByUserId;
    TalentModel.findByUserId = async () => mockDbProfile;

    try {
      const mock = createMockHttp({ user: { id: mockUserId } });
      await TalentController.getMyProfile(mock.req, mock.res, mock.next);
      assert.equal(mock.getStatusCode(), 200);
      assert.equal(mock.getResponseData().success, true);
      assert.equal(mock.getResponseData().data.profile.user_id, mockUserId);
      assert.equal(mock.getResponseData().data.completeness.score, 100);
    } finally {
      TalentModel.findByUserId = origFindByUserId;
    }
  });

  await t.test("PATCH /api/v1/talent/profile/me - 200 updating partial fields", async () => {
    const origUpdate = TalentModel.updateProfile;
    TalentModel.updateProfile = async (_userId, patch) => ({
      ...mockDbProfile,
      ...patch,
      headline: "Principal Engineer",
    });

    try {
      const mock = createMockHttp({
        user: { id: mockUserId },
        body: { headline: "Principal Engineer" },
      });
      await TalentController.updateMyProfile(mock.req, mock.res, mock.next);
      assert.equal(mock.getStatusCode(), 200);
      assert.equal(mock.getResponseData().success, true);
      assert.equal(mock.getResponseData().data.profile.headline, "Principal Engineer");
    } finally {
      TalentModel.updateProfile = origUpdate;
    }
  });

  await t.test("GET /api/v1/talent/profile/:id - 404 on nonexistent ID", async () => {
    const origFindById = TalentModel.findById;
    TalentModel.findById = async () => null;

    try {
      const mock = createMockHttp({ params: { id: "non-existent" } });
      await TalentController.getProfileById(mock.req, mock.res, mock.next);
      assert.equal(mock.getStatusCode(), 404);
    } finally {
      TalentModel.findById = origFindById;
    }
  });

  await t.test("GET /api/v1/talent/profile/:id - 200 on existing ID", async () => {
    const origFindById = TalentModel.findById;
    TalentModel.findById = async () => mockDbProfile;

    try {
      const mock = createMockHttp({ params: { id: mockProfileId } });
      await TalentController.getProfileById(mock.req, mock.res, mock.next);
      assert.equal(mock.getStatusCode(), 200);
      assert.equal(mock.getResponseData().success, true);
      assert.equal(mock.getResponseData().data.profile.id, mockProfileId);
    } finally {
      TalentModel.findById = origFindById;
    }
  });

  await t.test("GET /api/v1/talent/profiles - 200 on directory search", async () => {
    const origSearch = TalentModel.searchTalents;
    TalentModel.searchTalents = async () => ({
      talents: [mockDbProfile],
      total: 1,
    });

    try {
      const mock = createMockHttp({
        query: { skills: "TypeScript,Node.js", limit: "10" },
      });
      await TalentController.searchProfiles(mock.req, mock.res, mock.next);
      assert.equal(mock.getStatusCode(), 200);
      assert.equal(mock.getResponseData().success, true);
      assert.equal(mock.getResponseData().data.length, 1);
      assert.equal(mock.getResponseData().pagination.total, 1);
    } finally {
      TalentModel.searchTalents = origSearch;
    }
  });
});

// ============================================================================
// SUITE 5: Talent Model Integration with PostgreSQL Pool Mock
// ============================================================================
test("Suite 5: Talent Model Database Queries", async (t) => {
  const origQuery = pool.query;

  await t.test("findByUserId executes query and maps row", async () => {
    (pool as any).query = async (sql: string, params: any[]) => {
      assert.ok(sql.includes("FROM talent_profiles"));
      assert.equal(params[0], "user-abc");
      return {
        rows: [
          {
            id: "prof-1",
            user_id: "user-abc",
            full_name: "Test User",
            phone: "123",
            country: "US",
            location: "NYC",
            headline: "Dev",
            education: JSON.stringify([]),
            experience: JSON.stringify([]),
            skills: ["Node.js"],
            preferred_roles: ["Dev"],
            availability: "immediate",
            work_arrangement_pref: "remote",
            career_goals: "Build cool things",
            cv_url: null,
            profile_completeness: 50,
            readiness_score: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      };
    };

    try {
      const profile = await TalentModel.findByUserId("user-abc");
      assert.ok(profile !== null);
      assert.equal(profile.id, "prof-1");
      assert.equal(profile.user_id, "user-abc");
      assert.equal(profile.full_name, "Test User");
      assert.deepEqual(profile.skills, ["Node.js"]);
    } finally {
      pool.query = origQuery;
    }
  });

  await t.test("deleteByUserId returns true when row was deleted", async () => {
    (pool as any).query = async (sql: string, params: any[]) => {
      assert.ok(sql.includes("DELETE FROM talent_profiles"));
      assert.equal(params[0], "user-xyz");
      return { rowCount: 1 };
    };

    try {
      const deleted = await TalentModel.deleteByUserId("user-xyz");
      assert.equal(deleted, true);
    } finally {
      pool.query = origQuery;
    }
  });
});

// ============================================================================
// SUITE 6: OpenAPI & Swagger Documentation Contracts
// ============================================================================
test("Suite 6: OpenAPI & Swagger Documentation", async (t) => {
  await t.test("OpenAPI spec includes all talent routes and components", () => {
    assert.equal(openApiDocument.openapi, "3.1.0");
    assert.ok(openApiDocument.paths["/api/v1/talent/profile"]);
    assert.ok(openApiDocument.paths["/api/v1/talent/profile/me"]);
    assert.ok(openApiDocument.paths["/api/v1/talent/profiles"]);
    assert.ok(openApiDocument.components.schemas.TalentProfile);
    assert.ok(openApiDocument.components.schemas.CompletenessCalculation);
  });
});
