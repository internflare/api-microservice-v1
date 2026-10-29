import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { uploadToR2 } from "./storage.service.js";
import { requireValidFile, type UploadKind } from "../validators/upload.validator.js";

// Files parsed by the multipart middleware, keyed by form field name.
export const getUploadedFile = (
  response: Response,
  field: string,
): Express.Multer.File | undefined =>
  (response.locals.uploadedFiles as Record<string, Express.Multer.File> | undefined)?.[field];

// Validate a file's type and contents, store it in R2 under the user's folder and return its URL.
export async function storeFile(
  file: Express.Multer.File | undefined,
  kind: UploadKind,
  userId: string,
): Promise<string> {
  const valid = requireValidFile(file, kind);
  const key = `${kind.folder}/${userId}/${randomUUID()}${valid.extension}`;
  return uploadToR2(key, valid.file.buffer, kind.types[valid.extension]);
}
