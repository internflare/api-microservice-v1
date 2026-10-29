import express from "express";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./docs/openapi.js";
import { healthRoutes } from "./routes/health.routes.js";
import { opportunityRoutes } from "./routes/opportunity.routes.js";
import { savedOpportunityRoutes } from "./routes/saved_opportunity.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { corsMiddleware } from "./middleware/cors.js";

const app = express();

app.disable("x-powered-by");
app.use(corsMiddleware);
app.use(express.json({ limit: "1mb" }));
app.get("/openapi.json", (_request, response) => {
  response.json(openApiDocument);
});
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument),
);
app.use("/health", healthRoutes);
app.use("/saved-opportunities", savedOpportunityRoutes);
app.use("/job/saved-opportunities", savedOpportunityRoutes);
app.use("/opportunities", opportunityRoutes);
app.use("/job/listing", opportunityRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
