import "./instrument.js";
import express from "express";
import * as Sentry from "@sentry/node";
import swaggerUi from "swagger-ui-express";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { openApiDocument } from "./docs/openapi.js";
import { healthRoutes } from "./routes/health.routes.js";
import { emailNotificationRoutes } from "./routes/email-notification.routes.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "16kb" }));

app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument),
);
app.use("/health", healthRoutes);
app.use("/notifications", emailNotificationRoutes);
app.use(notFoundHandler);
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export { app };
