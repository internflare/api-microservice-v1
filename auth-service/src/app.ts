import "./instrument.js";
import cors from "cors";
import express from "express";
import * as Sentry from "@sentry/node";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { authRoutes } from "./routes/auth.routes.js";
import { sessionRoutes } from "./routes/session.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { config } from "./config.js";

const app = express();
const apiVersion = "/api/v1";

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

app.use(authRoutes);

app.use(express.json({ limit: "16kb" }));

app.use(`${apiVersion}/health`, healthRoutes);
app.use(`${apiVersion}/me`, sessionRoutes);
app.use(notFoundHandler);
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export { app };
