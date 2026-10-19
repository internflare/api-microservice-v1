import cors from "cors";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { config } from "./config.js";
import { talentRoutes } from "./routes/talent.routes.js";

const app: Express = express();

app.use(
  cors({
    origin: config.trustedOrigins,
    credentials: true,
  }),
);

app.use(express.json());

// Health Check Endpoints
const healthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "talent-service",
    timestamp: new Date().toISOString(),
  });
};

app.get("/health", healthHandler);
app.get("/api/v1/health", healthHandler);

// Domain Routes
app.use("/api/v1/talent", talentRoutes);
app.use("/api/talent", talentRoutes);

// Central error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[talent-service error]:", err);
  const status = typeof err === "object" && err !== null && "status" in err ? (err as any).status : 500;
  const message = err instanceof Error ? err.message : "Internal Server Error";
  res.status(status).json({ success: false, error: message });
});

export { app };
