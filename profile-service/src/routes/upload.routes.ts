import { Router } from "express";
import { UploadController } from "../controllers/upload.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadByPurpose } from "../middleware/upload.js";

const router = Router();

// One upload endpoint shared by talent and employer onboarding and the profile page.
router.post("/", requireAuth, uploadByPurpose, UploadController.upload);

export const uploadRoutes = router;

