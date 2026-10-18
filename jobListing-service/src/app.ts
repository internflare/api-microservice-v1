import express from "express";
import { healthRoutes } from "./routes/health.routes.js";
import { opportunityRoutes } from "./routes/opportunity.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";

const app = express();
const apiVersion = "/api/v1";

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(`${apiVersion}/health`, healthRoutes);
app.use(`${apiVersion}/opportunities`, opportunityRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
