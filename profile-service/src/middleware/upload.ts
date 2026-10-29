import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer from "multer";
import { AppError } from "../utils/appError.js";
import { extensionOf, resolveUploadKind, UPLOAD_KINDS, type UploadKind } from "../validators/upload.validator.js";

// Parse multipart files into memory, rejecting wrong types and oversize files early.
// Each field has its own rules; the largest limit is applied per file by the filter below.
function multipartParser(fields: Record<string, UploadKind>): RequestHandler {
  const maxBytes = Math.max(...Object.values(fields).map((kind) => kind.maxBytes));
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: Object.keys(fields).length },
    fileFilter: (_request, file, callback) => {
      const kind = fields[file.fieldname];
      if (!kind) {
        callback(new AppError(`Unexpected file field "${file.fieldname}"`, 400));
      } else if (!kind.types[extensionOf(file.originalname)]) {
        callback(new AppError(`Invalid file type. Upload a ${kind.label}`, 400));
      } else {
        callback(null, true);
      }
    },
  }).fields(Object.keys(fields).map((name) => ({ name, maxCount: 1 })));

  // Translate multer's own errors into the service's error format.
  return (request: Request, response: Response, next: NextFunction) => {
    parser(request, response, (error?: unknown) => {
      if (error instanceof multer.MulterError) {
        const tooBig = error.code === "LIMIT_FILE_SIZE";
        next(
          new AppError(
            tooBig
              ? `File is too large. Maximum size is ${maxBytes / 1024 / 1024} MB`
              : `Upload failed: ${error.message}`,
            tooBig ? 413 : 400,
          ),
        );
        return;
      }
      next(error);
    });
  };
}

// Normalise multer's field map so controllers can read `request.file` / `request.files` uniformly.
const toFileMap = (request: Request): Record<string, Express.Multer.File> => {
  const files = (request.files ?? {}) as Record<string, Express.Multer.File[]>;
  return Object.fromEntries(
    Object.entries(files).map(([name, list]) => [name, list[0]]),
  );
};

// Accept a submit as JSON, or as multipart with a `data` JSON field plus the named files.
// Files stay in memory until the controller has validated the data and stores them in R2.
function multipartSubmission(fields: Record<string, UploadKind>): RequestHandler {
  const parse = multipartParser(fields);
  return (request, response, next) => {
    if (!request.is("multipart/form-data")) {
      next();
      return;
    }
    parse(request, response, (error?: unknown) => {
      if (error) {
        next(error);
        return;
      }
      try {
        request.body = JSON.parse(String(request.body?.data ?? "{}"));
        response.locals.uploadedFiles = toFileMap(request);
        next();
      } catch {
        next(new AppError('The "data" field must contain valid JSON', 400));
      }
    });
  };
}

// Talent onboarding: optional `cv` file.
export const profileSubmission = multipartSubmission({ cv: UPLOAD_KINDS.cv });

// Employer onboarding: optional `logo` and `cac_document` files.
export const employerSubmission = multipartSubmission({
  logo: UPLOAD_KINDS.logo,
  cac_document: UPLOAD_KINDS.cac_document,
});

// Pick the upload rules from ?purpose= and parse the single `file` with them.
export const uploadByPurpose: RequestHandler = (request, response, next) => {
  try {
    const kind = resolveUploadKind(request.query.purpose);
    response.locals.uploadKind = kind;
    multipartParser({ [kind.field]: kind })(request, response, (error?: unknown) => {
      if (!error) request.file = toFileMap(request)[kind.field];
      next(error);
    });
  } catch (error) {
    next(error);
  }
};
