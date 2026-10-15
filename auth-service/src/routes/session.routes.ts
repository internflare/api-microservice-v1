import { Router } from "express";
import { getCurrentSession } from "../controllers/session.controller.js";

export const sessionRoutes = Router();

sessionRoutes.get("/", getCurrentSession);
