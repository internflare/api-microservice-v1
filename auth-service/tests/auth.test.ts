import assert from "node:assert/strict";
import test from "node:test";
import { openApiDocument } from "../src/docs/openapi.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { notFoundHandler } from "../src/middleware/not-found-handler.js";

function createMockHttp() {
  let statusCode = 200;
  let responseData: any = null;

  const req: any = {};
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

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
  };
}

test("Auth Service - OpenAPI Documentation Specification", async (t) => {
  await t.test("OpenAPI spec is defined and conforms to 3.1.0", () => {
    assert.equal(openApiDocument.openapi, "3.1.0");
    assert.equal(openApiDocument.info.title, "Internflare Auth Service");
    assert.ok(openApiDocument.paths["/health"]);
    assert.ok(openApiDocument.paths["/me"]);
    assert.ok(openApiDocument.paths["/api/auth/sign-in/email"]);
    assert.ok(openApiDocument.paths["/api/auth/sign-up/email"]);
    assert.ok(openApiDocument.paths["/api/auth/verify-email"]);
    assert.ok(openApiDocument.paths["/api/auth/sign-out"]);
    assert.ok(openApiDocument.paths["/api/auth/get-session"]);
  });
});

test("Auth Service - Error & Not Found Middlewares", async (t) => {
  await t.test("notFoundHandler responds with 404 and Not Found error", () => {
    const { req, res, getStatusCode, getResponseData } = createMockHttp();

    notFoundHandler(req, res, () => {});

    assert.equal(getStatusCode(), 404);
    assert.equal(getResponseData().error, "Not found");
  });

  await t.test("errorHandler handles server error with 500", () => {
    const { req, res, getStatusCode, getResponseData } = createMockHttp();
    const error = new Error("Database connection lost");

    errorHandler(error, req, res, () => {});

    assert.equal(getStatusCode(), 500);
    assert.equal(getResponseData().error, "Internal server error");
  });
});
