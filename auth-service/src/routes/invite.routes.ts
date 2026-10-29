import { Router } from "express";
import { getInvite, signUpWithInvite } from "../controllers/invite.controller.js";

export const inviteRoutes = Router();

inviteRoutes.post("/signup", signUpWithInvite);
inviteRoutes.get("/:token", getInvite);
