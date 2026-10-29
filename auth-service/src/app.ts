import "./instrument.js";
import cors from "cors";
import express from "express";
import * as Sentry from "@sentry/node";
import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { sessionRoutes } from "./routes/session.routes.js";
import { inviteRoutes } from "./routes/invite.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { config } from "./config.js";
import { openApiDocument } from "./docs/openapi.js";

const app = express();

// Disable the "X-Powered-By" header to prevent exposing the underlying technology.
app.disable("x-powered-by");

// Only configured frontend origins may make credentialed browser requests.
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, !origin || config.trustedOrigins.includes(origin));
    },
    credentials: true,
  }),
);

app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.use(createAuthRoutes());

app.use(express.json({ limit: "16kb" }));

app.use("/health", healthRoutes);
app.use("/me", sessionRoutes);
app.use("/invites", inviteRoutes);
app.use(notFoundHandler);
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export { app };
