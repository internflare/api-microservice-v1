import type { NextFunction, Request, Response } from "express";
import { storeFile } from "../services/upload.service.js";
import { getAuthenticatedUserId } from "../validators/request.validator.js";
import type { UploadKind } from "../validators/upload.validator.js";

export const UploadController = {
  /**
   * POST /api/v1/uploads?purpose=cv|avatar|logo|cac_document
   * Validates the file, stores it in R2 and returns its URL. The caller saves the URL
   * with its own request.
   */
  async upload(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = getAuthenticatedUserId(req, res);
      if (!userId) return;

      const kind = res.locals.uploadKind as UploadKind;
      const url = await storeFile(req.file, kind, userId);

      res.status(200).json({ success: true, data: { url, purpose: req.query.purpose } });
    } catch (error) {
      next(error);
    }
  },
};
