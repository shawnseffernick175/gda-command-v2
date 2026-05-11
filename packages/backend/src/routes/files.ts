import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";
import {
  generateStorageKey,
  saveFile,
  readFile,
  deleteFile,
  getStorageUsage,
  isAllowedMimeType,
  getMaxFileSize,
} from "../lib/storage";

const router = Router();

// ---------------------------------------------------------------------------
// Multer config — memory storage (buffer), max 50 MB
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: getMaxFileSize() },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMimeType(file.mimetype)) {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
      return;
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------------
// POST /api/files/upload — upload a file
// ---------------------------------------------------------------------------
router.post(
  "/upload",
  requireRole("admin", "bd_manager", "capture_lead", "analyst"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json(
          errorEnvelope("gda-files", "upload", {
            code: "BAD_REQUEST",
            message: "No file provided. Send a multipart form with field name 'file'.",
            detail: null,
          }),
        );
        return;
      }

      const storageKey = generateStorageKey(file.originalname);
      saveFile(storageKey, file.buffer);

      const pool = getPool();
      let fileId = `file-${Date.now()}`;

      if (pool) {
        const { rows } = await pool.query(
          `INSERT INTO uploaded_files (id, original_name, storage_key, mime_type, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, original_name, storage_key, mime_type, size_bytes, uploaded_by, created_at`,
          [fileId, file.originalname, storageKey, file.mimetype, file.size, req.user?.userId ?? null],
        );
        if (rows.length > 0) {
          fileId = rows[0].id;
        }
      }

      log.info("file_uploaded", {
        fileId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedBy: req.user?.userId,
      });

      res.json(
        successEnvelope("gda-files", "upload", {
          id: fileId,
          original_name: file.originalname,
          storage_key: storageKey,
          mime_type: file.mimetype,
          size_bytes: file.size,
          download_url: `/api/files/${fileId}/download`,
        }),
      );
    } catch (err) {
      log.error("file_upload_error", { error: (err as Error).message });
      res.status(500).json(
        errorEnvelope("gda-files", "upload", {
          code: "INTERNAL",
          message: (err as Error).message || "Upload failed",
          detail: null,
        }),
      );
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/files/:id/download — download a file
// ---------------------------------------------------------------------------
router.get("/:id/download", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("gda-files", "download", {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { rows } = await pool.query(
      "SELECT original_name, storage_key, mime_type, size_bytes FROM uploaded_files WHERE id = $1",
      [req.params.id],
    );

    if (rows.length === 0) {
      res.status(404).json(
        errorEnvelope("gda-files", "download", {
          code: "NOT_FOUND",
          message: "File not found",
          detail: null,
        }),
      );
      return;
    }

    const { original_name, storage_key, mime_type } = rows[0];
    const buffer = readFile(storage_key);

    if (!buffer) {
      res.status(404).json(
        errorEnvelope("gda-files", "download", {
          code: "NOT_FOUND",
          message: "File data not found on disk",
          detail: null,
        }),
      );
      return;
    }

    res.setHeader("Content-Type", mime_type);
    res.setHeader("Content-Disposition", `attachment; filename="${original_name}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    log.error("file_download_error", { error: (err as Error).message });
    res.status(500).json(
      errorEnvelope("gda-files", "download", {
        code: "INTERNAL",
        message: "Download failed",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/files/:id — delete a file
// ---------------------------------------------------------------------------
router.delete("/:id", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("gda-files", "delete", {
          code: "SERVICE_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { rows } = await pool.query(
      "DELETE FROM uploaded_files WHERE id = $1 RETURNING storage_key",
      [req.params.id],
    );

    if (rows.length === 0) {
      res.status(404).json(
        errorEnvelope("gda-files", "delete", {
          code: "NOT_FOUND",
          message: "File not found",
          detail: null,
        }),
      );
      return;
    }

    deleteFile(rows[0].storage_key);
    log.info("file_deleted_by_user", { fileId: req.params.id, deletedBy: req.user?.userId });

    res.json(successEnvelope("gda-files", "delete", { id: req.params.id, deleted: true }));
  } catch (err) {
    log.error("file_delete_error", { error: (err as Error).message });
    res.status(500).json(
      errorEnvelope("gda-files", "delete", {
        code: "INTERNAL",
        message: "Delete failed",
        detail: null,
      }),
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/files/storage/stats — storage usage summary
// ---------------------------------------------------------------------------
router.get("/storage/stats", requireRole("admin"), (_req: Request, res: Response) => {
  try {
    const usage = getStorageUsage();
    res.json(
      successEnvelope("gda-files", "storage-stats", {
        ...usage,
        totalMB: Math.round(usage.totalBytes / 1_048_576 * 10) / 10,
        maxFileSizeMB: getMaxFileSize() / 1_048_576,
      }),
    );
  } catch (err) {
    log.error("storage_stats_error", { error: (err as Error).message });
    res.status(500).json(
      errorEnvelope("gda-files", "storage-stats", {
        code: "INTERNAL",
        message: "Failed to get storage stats",
        detail: null,
      }),
    );
  }
});

// Multer error handler
router.use((err: Error, _req: Request, res: Response, next: Function) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json(
        errorEnvelope("gda-files", "upload", {
          code: "FILE_TOO_LARGE",
          message: `File exceeds maximum size of ${getMaxFileSize() / 1_048_576} MB`,
          detail: null,
        }),
      );
      return;
    }
    res.status(400).json(
      errorEnvelope("gda-files", "upload", {
        code: "UPLOAD_ERROR",
        message: err.message,
        detail: null,
      }),
    );
    return;
  }
  if (err.message?.includes("not allowed")) {
    res.status(415).json(
      errorEnvelope("gda-files", "upload", {
        code: "UNSUPPORTED_TYPE",
        message: err.message,
        detail: null,
      }),
    );
    return;
  }
  next(err);
});

export default router;
