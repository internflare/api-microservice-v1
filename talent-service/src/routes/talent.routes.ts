import { Router } from "express";
import { TalentController } from "../controllers/talent.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Authenticated current talent routes
router.post("/profile", requireAuth, TalentController.upsertMyProfile);
router.get("/profile/me", requireAuth, TalentController.getMyProfile);
router.patch("/profile/me", requireAuth, TalentController.updateMyProfile);

// Public / Recruiter discovery routes
router.get("/profile/:id", TalentController.getProfileById);
router.get("/profiles", TalentController.searchProfiles);

export const talentRoutes = router;
