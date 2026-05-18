import fs from "fs";
import path from "path";
import crypto from "crypto";
import { log } from "./logger";

// ---------------------------------------------------------------------------
// File storage service — local filesystem with optional S3 upgrade path
// ---------------------------------------------------------------------------

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/gif",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    log.info("storage_dir_created", { path: UPLOAD_DIR });
  }
}

/**
 * Map file extensions to their correct MIME types.
 * Used as fallback when clients send application/octet-stream.
 */
const EXT_MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".md": "text/markdown",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

/**
 * Resolve the correct MIME type for a file. If the reported MIME type is
 * generic (application/octet-stream), fall back to extension-based lookup.
 */
export function resolveMimeType(reportedMime: string, originalName: string): string {
  if (reportedMime !== "application/octet-stream") return reportedMime;
  const ext = path.extname(originalName).toLowerCase();
  return EXT_MIME_MAP[ext] ?? reportedMime;
}

export function isAllowedMimeType(mimeType: string, originalName?: string): boolean {
  const resolved = originalName ? resolveMimeType(mimeType, originalName) : mimeType;
  return ALLOWED_MIME_TYPES.has(resolved);
}

export function getMaxFileSize(): number {
  return MAX_FILE_SIZE;
}

/**
 * Generate a unique storage key for a file.
 * Format: YYYY/MM/uuid-originalname
 */
export function generateStorageKey(originalName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const id = crypto.randomUUID();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${year}/${month}/${id}-${safeName}`;
}

/**
 * Save a file buffer to local storage.
 * Returns the storage key (relative path within UPLOAD_DIR).
 */
export function saveFile(storageKey: string, buffer: Buffer): string {
  ensureUploadDir();
  const fullPath = path.join(UPLOAD_DIR, storageKey);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, buffer);
  log.info("file_saved", { key: storageKey, sizeBytes: buffer.length });
  return storageKey;
}

/**
 * Read a file from storage. Returns null if not found.
 */
export function readFile(storageKey: string): Buffer | null {
  const fullPath = path.join(UPLOAD_DIR, storageKey);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath);
}

/**
 * Delete a file from storage. Returns true if deleted.
 */
export function deleteFile(storageKey: string): boolean {
  const fullPath = path.join(UPLOAD_DIR, storageKey);
  if (!fs.existsSync(fullPath)) return false;
  fs.unlinkSync(fullPath);
  log.info("file_deleted", { key: storageKey });
  return true;
}

/**
 * Get file stats. Returns null if not found.
 */
export function getFileStats(storageKey: string): { sizeBytes: number; modifiedAt: Date } | null {
  const fullPath = path.join(UPLOAD_DIR, storageKey);
  if (!fs.existsSync(fullPath)) return null;
  const stats = fs.statSync(fullPath);
  return { sizeBytes: stats.size, modifiedAt: stats.mtime };
}

/**
 * Get total storage usage in bytes.
 */
export function getStorageUsage(): { totalBytes: number; fileCount: number } {
  if (!fs.existsSync(UPLOAD_DIR)) return { totalBytes: 0, fileCount: 0 };
  let totalBytes = 0;
  let fileCount = 0;
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        totalBytes += fs.statSync(full).size;
        fileCount++;
      }
    }
  }
  walk(UPLOAD_DIR);
  return { totalBytes, fileCount };
}
