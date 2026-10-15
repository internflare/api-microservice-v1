import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { authRoutes } from "./routes/auth.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { sessionRoutes } from "./routes/session.routes.js";
import { config } from "./config.js";

const app = express();

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

app.use("/api/health", healthRoutes);
app.use("/api/me", sessionRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
