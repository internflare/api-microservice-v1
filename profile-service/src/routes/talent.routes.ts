import { Router } from "express";
import { TalentController } from "../controllers/talent.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { profileSubmission } from "../middleware/upload.js";

const router = Router();

// Authenticated current talent profile routes.
router.post("/profile", requireAuth, profileSubmission, TalentController.upsertMyProfile);
router.get("/profile/me", requireAuth, TalentController.getMyProfile);
router.patch("/profile/me", requireAuth, TalentController.updateMyProfile);

// Public / Recruiter discovery routes
router.get("/profile/:id", TalentController.getProfileById);
router.get("/profiles", TalentController.searchProfiles);

export const talentRoutes = router;

