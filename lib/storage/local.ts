import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * ⚠️ DEV-ONLY LOCAL DISK STORAGE.
 *
 * Writes uploaded files under public/uploads so Next.js serves them
 * statically with zero extra route code — fine for local development,
 * but files here do NOT survive a serverless/container redeploy and
 * this directory is NOT backed up. Swap this module for a real object
 * store (S3, Cloudflare R2, Supabase Storage, etc.) before production;
 * every caller only depends on `saveUploadedFile`'s signature below, so
 * that's the one function to reimplement.
 */

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export class UploadValidationError extends Error {}

/**
 * Saves an uploaded File under a namespaced subfolder and returns the
 * public URL path it can be reached at (e.g. "/uploads/site-surveys/
 * <surveyKey>/<uuid>.jpg").
 */
export async function saveUploadedFile(file: File, subfolder: string): Promise<string> {
  if (file.size === 0) {
    throw new UploadValidationError("Uploaded file is empty.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UploadValidationError(`Uploaded file exceeds ${MAX_FILE_BYTES / (1024 * 1024)}MB.`);
  }
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    throw new UploadValidationError(`Unsupported file type: ${file.type}`);
  }

  const safeSubfolder = subfolder.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(UPLOAD_ROOT, safeSubfolder);
  await mkdir(dir, { recursive: true });

  const ext = extensionFromMime(file.type) ?? "jpg";
  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return `/uploads/${safeSubfolder}/${filename}`;
}

function extensionFromMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "application/pdf":
      return "pdf";
    default:
      return null;
  }
}

const BILL_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/**
 * Same on-disk convention as `saveUploadedFile`, but for customer bill
 * uploads (PDF or photo) — a separate function rather than widening
 * `saveUploadedFile`'s ALLOWED_MIME_TYPES, since that set is also relied
 * on by the (image-only) site-survey photo upload path and shouldn't
 * silently start accepting PDFs there too. Same dev-only-disk caveat
 * applies — see the module doc above.
 */
export async function saveUploadedBillFile(file: File, subfolder: string): Promise<string> {
  if (file.size === 0) {
    throw new UploadValidationError("Uploaded file is empty.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new UploadValidationError(`Uploaded file exceeds ${MAX_FILE_BYTES / (1024 * 1024)}MB.`);
  }
  if (file.type && !BILL_FILE_MIME_TYPES.has(file.type)) {
    throw new UploadValidationError(`Unsupported file type: ${file.type}`);
  }

  const safeSubfolder = subfolder.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(UPLOAD_ROOT, safeSubfolder);
  await mkdir(dir, { recursive: true });

  const ext = extensionFromMime(file.type) ?? "bin";
  const filename = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return `/uploads/${safeSubfolder}/${filename}`;
}
