import { Router } from "express";
import { getPool } from "../lib/db";
import { successEnvelope } from "../middleware/envelope";
import { log } from "../lib/logger";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const router = Router();

const BACKUP_DIR = process.env.BACKUP_DIR ?? "/var/backups/gda";
const DAILY_DIR = path.join(BACKUP_DIR, "daily");

// GET /api/backup/status — list available backups
router.get("/status", async (_req, res) => {
  try {
    const backups: { daily: string[]; weekly: string[] } = { daily: [], weekly: [] };

    for (const sub of ["daily", "weekly"] as const) {
      const dir = path.join(BACKUP_DIR, sub);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
          .filter((f) => f.endsWith(".sql.gz"))
          .sort()
          .reverse();
        backups[sub] = files.map((f) => {
          const stats = fs.statSync(path.join(dir, f));
          return `${f} (${(stats.size / 1024).toFixed(0)} KB)`;
        });
      }
    }

    // DB size
    const pool = getPool();
    let dbSize = "unknown";
    if (pool) {
      try {
        const { rows } = await pool.query(
          "SELECT pg_size_pretty(pg_database_size(current_database())) AS size"
        );
        dbSize = rows[0]?.size ?? "unknown";
      } catch {
        // ignore
      }
    }

    // Table counts
    let tableCount = 0;
    let totalRows = 0;
    if (pool) {
      try {
        const { rows } = await pool.query(
          "SELECT COUNT(*) AS tables, COALESCE(SUM(n_live_tup), 0) AS rows FROM pg_stat_user_tables"
        );
        tableCount = parseInt(rows[0]?.tables ?? "0");
        totalRows = parseInt(rows[0]?.rows ?? "0");
      } catch {
        // ignore
      }
    }

    res.json(successEnvelope("gda-backup", "status", {
      backupDir: BACKUP_DIR,
      database: {
        size: dbSize,
        tables: tableCount,
        totalRows,
      },
      backups,
    }));
  } catch (err) {
    log.error("backup_status_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Failed to get backup status" });
  }
});

// POST /api/backup/create — trigger an on-demand backup
router.post("/create", async (_req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `gda_command_${timestamp}_manual.sql.gz`;

    if (!fs.existsSync(DAILY_DIR)) {
      fs.mkdirSync(DAILY_DIR, { recursive: true });
    }

    const filePath = path.join(DAILY_DIR, filename);

    // Use pg_dump via DATABASE_URL for in-container operation
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(500).json({ success: false, error: "DATABASE_URL not configured" });
      return;
    }

    log.info("backup_started", { filename });

    // Pass DATABASE_URL via GDA_DUMP_URL env var to avoid shell metacharacter
    // injection from passwords. Use pipefail so pg_dump failures propagate.
    execSync(`bash -c 'set -o pipefail; pg_dump --dbname="$GDA_DUMP_URL" --no-owner --no-privileges --clean --if-exists | gzip > "${filePath}"'`, {
      timeout: 60_000,
      env: { ...process.env, GDA_DUMP_URL: dbUrl },
    });

    const stats = fs.statSync(filePath);

    // A valid backup should be >100 bytes; an empty gzip is ~20 bytes
    const MIN_BACKUP_BYTES = 100;
    if (stats.size < MIN_BACKUP_BYTES) {
      fs.unlinkSync(filePath);
      throw new Error(`pg_dump produced empty output (${stats.size} bytes) — check database connectivity`);
    }

    const sizeKB = (stats.size / 1024).toFixed(0);

    log.info("backup_completed", { filename, sizeKB });

    res.json(successEnvelope("gda-backup", "create", {
      filename,
      sizeKB: parseInt(sizeKB),
      path: filePath,
      createdAt: new Date().toISOString(),
    }));
  } catch (err) {
    log.error("backup_create_error", { error: (err as Error).message });
    res.status(500).json({ success: false, error: "Backup failed: " + (err as Error).message });
  }
});

export default router;
