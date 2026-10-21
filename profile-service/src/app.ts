import cors from "cors";
import swaggerUi from "swagger-ui-express";
import express, { type Express, type Request, type Response } from "express";
import { config } from "./config.js";
import { companyRoutes } from "./routes/company.routes.js";
import { employerRoutes } from "./routes/employer.routes.js";
import { internalRoutes } from "./routes/internal.routes.js";
import { talentRoutes } from "./routes/talent.routes.js";
import { openApiDocument } from "./docs/openapi.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";

const app: Express = express();

app.disable("x-powered-by");
app.use(
  cors({
    origin: config.trustedOrigins,
    credentials: true,
  }),
);

app.use(express.json());

app.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});
app.get("/api/v1/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

// Health Check Endpoints
const healthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "profile-service",
    timestamp: new Date().toISOString(),
  });
};

app.get("/health", healthHandler);

// Domain Routes
app.use("/company", companyRoutes);
app.use("/employer", employerRoutes);
app.use("/internal", internalRoutes);
app.use("/talent", talentRoutes);
app.use("/api/talent", talentRoutes);
app.use("/api/v1/talent", talentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
