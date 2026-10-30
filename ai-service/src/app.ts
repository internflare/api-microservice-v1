import express from "express";
import { config } from "./config.js";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { getHealth } from "./controllers/health.controller.js";
import { openApiDocument } from "./docs/openapi.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { assessmentRoutes } from "./routes/assessment.routes.js";
import { listingRoutes } from "./routes/listing.routes.js";
import { careerToolRoutes } from "./routes/career-tool.routes.js";

const app = express();

app.disable("x-powered-by");
// The gateway forwards upstream headers untouched, so this service must answer the browser's CORS checks.
app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && origin === config.frontendUrl.replace(/\/$/, "")) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      response.setHeader(
        "Access-Control-Allow-Headers",
        request.headers["access-control-request-headers"] ?? "Content-Type",
      );
      response.status(204).end();
      return;
    }
  }
  next();
});
// Swagger UI needs inline scripts, so helmet's CSP is relaxed only for the docs route.
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use("/ai/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use(helmet());
app.use(express.json({ limit: "256kb" }));

app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});
app.get("/ai/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});
app.get("/health", getHealth);
app.use("/ai/assessments", assessmentRoutes);
app.use("/ai/listings", listingRoutes);
app.use("/ai/career-tools", careerToolRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
