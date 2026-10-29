import { Router } from "express";
import rateLimit from "express-rate-limit";
import { draftDescription } from "../controllers/listing.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const listingRoutes = Router();

// Each draft calls OpenAI, so cap bursts per client.
const draftLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many drafts requested, slow down" },
});

listingRoutes.use(requireAuth);
listingRoutes.post("/description", draftLimiter, draftDescription);
