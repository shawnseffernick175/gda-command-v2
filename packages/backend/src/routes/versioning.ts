import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getVersionHistory, getVersion, restoreVersion, softDelete, isAllowedTable } from "../lib/versioning";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";

const router = Router();

const PK_COLUMNS: Record<string, string> = {
  company_entity: "entity_id",
};

function pkFor(table: string): string {
  return PK_COLUMNS[table] ?? "id";
}

const TABLE_VALIDATION_ERROR = {
  code: "INVALID_TABLE",
  message: "Table name not in allowlist",
  detail: null,
};

/** GET /api/versions/trash/:table — list soft-deleted records for a table (admin only) */
router.get(
  "/trash/:table",
  requireRole("admin"),
  async (req, res) => {
    const { table } = req.params;
    if (!isAllowedTable(table)) {
      res.status(400).json(errorEnvelope("versioning", "trash", TABLE_VALIDATION_ERROR));
      return;
    }
    const pool = getPool();
    if (!pool) {
      res.json(successEnvelope("versioning", "trash", { records: [] }));
      return;
    }
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    try {
      const { rows } = await pool.query(
        `SELECT * FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT $1`,
        [limit]
      );
      res.json(successEnvelope("versioning", "trash", { records: rows, total: rows.length }));
    } catch (err) {
      res.status(500).json(
        errorEnvelope("versioning", "trash", {
          code: "DB_ERROR",
          message: (err as Error).message,
          detail: null,
        })
      );
    }
  }
);

/** DELETE /api/versions/soft-delete/:table/:recordId — soft-delete a record (admin only) */
router.delete(
  "/soft-delete/:table/:recordId",
  requireRole("admin"),
  async (req, res) => {
    const { table, recordId } = req.params;
    if (!isAllowedTable(table)) {
      res.status(400).json(errorEnvelope("versioning", "soft-delete", TABLE_VALIDATION_ERROR));
      return;
    }
    const userId = req.user?.userId ?? "unknown";
    const ok = await softDelete(table, recordId, userId, pkFor(table));
    if (!ok) {
      res.status(404).json(
        errorEnvelope("versioning", "soft-delete", {
          code: "NOT_FOUND",
          message: "Record not found or already deleted",
          detail: null,
        })
      );
      return;
    }
    res.json(successEnvelope("versioning", "soft-delete", { deleted: true }));
  }
);

/** GET /api/versions/:table/:recordId — version history for a record */
router.get("/:table/:recordId", async (req, res) => {
  const { table, recordId } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const history = await getVersionHistory(table, recordId, limit);
  res.json(successEnvelope("versioning", "history", { versions: history, total: history.length }));
});

/** GET /api/versions/:table/:recordId/:versionNumber — specific version */
router.get("/:table/:recordId/:versionNumber", async (req, res) => {
  const { table, recordId, versionNumber } = req.params;
  const ver = await getVersion(table, recordId, parseInt(versionNumber));
  if (!ver) {
    res.status(404).json(
      errorEnvelope("versioning", "get", {
        code: "NOT_FOUND",
        message: "Version not found",
        detail: null,
      })
    );
    return;
  }
  res.json(successEnvelope("versioning", "get", ver));
});

/** POST /api/versions/:table/:recordId/restore — restore to a version (admin only) */
router.post(
  "/:table/:recordId/restore",
  requireRole("admin"),
  async (req, res) => {
    const { table, recordId } = req.params;
    if (!isAllowedTable(table)) {
      res.status(400).json(errorEnvelope("versioning", "restore", TABLE_VALIDATION_ERROR));
      return;
    }
    const { version_number } = req.body;
    if (!version_number || typeof version_number !== "number") {
      res.status(400).json(
        errorEnvelope("versioning", "restore", {
          code: "VALIDATION_ERROR",
          message: "version_number (integer) is required",
          detail: null,
        })
      );
      return;
    }
    const userId = req.user?.userId ?? "unknown";
    const restored = await restoreVersion(table, recordId, version_number, userId, pkFor(table));
    if (!restored) {
      res.status(404).json(
        errorEnvelope("versioning", "restore", {
          code: "NOT_FOUND",
          message: "Version not found or restore failed",
          detail: null,
        })
      );
      return;
    }
    res.json(successEnvelope("versioning", "restore", restored));
  }
);

export default router;
