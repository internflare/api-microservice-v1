import cors from "cors";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { config } from "./config.js";
import { companyRoutes } from "./routes/company.routes.js";
import { adminRoutes } from "./routes/admin.routes.js";
import { internalRoutes } from "./routes/internal.routes.js";

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
    service: "profile-service",
    timestamp: new Date().toISOString(),
  });
};

app.get("/health", healthHandler);

// Domain Routes
app.use("/profile", companyRoutes);
app.use("/auth", companyRoutes);
app.use("/admin", adminRoutes);
app.use("/internal", internalRoutes);

// Central error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[profile-service error]:", err);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as any).status
      : 500;
  const message = err instanceof Error ? err.message : "Internal Server Error";
  res.status(status).json({ error: message });
});

export { app };
