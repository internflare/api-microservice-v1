import { AppError } from "../utils/appError.js";

export interface UploadKind {
  field: string;
  maxBytes: number;
  folder: string;
  // Allowed extensions mapped to the MIME type we store and serve the file as.
  types: Record<string, string>;
  label: string;
}

const MB = 1024 * 1024;

// Every purpose shares one endpoint and one multipart field.
export const UPLOAD_FIELD = "file";

const IMAGE_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// What can be uploaded, selected by the `purpose` query parameter.
export const UPLOAD_KINDS: Record<string, UploadKind> = {
  cv: {
    field: UPLOAD_FIELD,
    maxBytes: 5 * MB,
    folder: "cv",
    types: {
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    label: "CV (PDF or DOCX)",
  },
  avatar: {
    field: UPLOAD_FIELD,
    maxBytes: 2 * MB,
    folder: "avatar",
    types: IMAGE_TYPES,
    label: "profile image (JPG, PNG or WebP)",
  },
  logo: {
    field: UPLOAD_FIELD,
    maxBytes: 2 * MB,
    folder: "logo",
    types: IMAGE_TYPES,
    label: "logo (JPG, PNG or WebP)",
  },
  cac_document: {
    field: UPLOAD_FIELD,
    maxBytes: 5 * MB,
    folder: "cac",
    types: { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" },
    label: "registration document (PDF, JPG or PNG)",
  },
};

// Look up the upload kind for a purpose, or fail with a 400.
export function resolveUploadKind(purpose: unknown): UploadKind {
  const kind = typeof purpose === "string" ? UPLOAD_KINDS[purpose] : undefined;
  if (!kind) {
    throw new AppError(`Invalid purpose. Use one of: ${Object.keys(UPLOAD_KINDS).join(", ")}`, 400);
  }
  return kind;
}

// Extension of a file name, lowercased, or an empty string.
export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
};

// True when the file's first bytes match the format its extension claims (stops renamed files).
export function matchesSignature(extension: string, buffer: Buffer): boolean {
  const startsWith = (...bytes: number[]) => bytes.every((byte, i) => buffer[i] === byte);
  switch (extension) {
    case ".pdf":
      return startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
    case ".docx":
      return startsWith(0x50, 0x4b, 0x03, 0x04); // zip container
    case ".jpg":
    case ".jpeg":
      return startsWith(0xff, 0xd8, 0xff);
    case ".png":
      return startsWith(0x89, 0x50, 0x4e, 0x47);
    case ".webp":
      return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    default:
      return false;
  }
}

// Validate an uploaded file against its kind and return it with its extension.
export function requireValidFile(
  file: Express.Multer.File | undefined,
  kind: UploadKind,
): { file: Express.Multer.File; extension: string } {
  if (!file) throw new AppError(`Attach your ${kind.label} in the "${kind.field}" field`, 400);
  const extension = extensionOf(file.originalname);
  if (!kind.types[extension] || !matchesSignature(extension, file.buffer)) {
    throw new AppError(`Invalid file. Upload a ${kind.label}`, 400);
  }
  return { file, extension };
}
