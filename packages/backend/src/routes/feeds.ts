import { Router, Request, Response } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { isSAMConfigured } from "../lib/sam-api";
import {
  syncSAMOpportunities,
  syncFPDSAwards,
  syncAllFeeds,
  type SyncResult,
} from "../lib/feed-sync";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/feeds/status — feed sync status
// ---------------------------------------------------------------------------
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();

    const feeds = [
      {
        id: "sam-opportunities",
        name: "SAM.gov Opportunities",
        source: "api.sam.gov",
        configured: isSAMConfigured(),
        api_key_env: "SAM_API_KEY",
        description: "Federal contract opportunities from SAM.gov",
      },
      {
        id: "fpds-awards",
        name: "FPDS Contract Awards",
        source: "api.usaspending.gov",
        configured: true, // No API key needed
        api_key_env: null,
        description: "Federal contract award data from USAspending.gov",
      },
    ];

    // Get last sync info from DB
    if (pool) {
      try {
        // SAM scan runs
        const samRuns = await pool.query(
          `SELECT id, started_at, completed_at, status, opportunities_found, new_matches, error
           FROM sam_scan_runs ORDER BY started_at DESC LIMIT 5`,
        );
        const samFeed = feeds.find((f) => f.id === "sam-opportunities");
        if (samFeed) {
          Object.assign(samFeed, {
            last_sync: samRuns.rows[0]?.completed_at ?? null,
            last_status: samRuns.rows[0]?.status ?? null,
            last_count: samRuns.rows[0]?.opportunities_found ?? 0,
            recent_runs: samRuns.rows,
          });
        }

        // Count records
        const samCount = await pool.query("SELECT COUNT(*) as count FROM sam_opportunities");
        const fpdsCount = await pool.query("SELECT COUNT(*) as count FROM fpds_awards");

        const samFeedObj = feeds.find((f) => f.id === "sam-opportunities");
        const fpdsFeedObj = feeds.find((f) => f.id === "fpds-awards");
        if (samFeedObj) Object.assign(samFeedObj, { record_count: parseInt(samCount.rows[0].count) });
        if (fpdsFeedObj) Object.assign(fpdsFeedObj, { record_count: parseInt(fpdsCount.rows[0].count) });
      } catch { /* fall through with defaults */ }
    }

    res.json(successEnvelope("gda-feeds", "status", { feeds }));
  } catch (err) {
    res.status(500).json(errorEnvelope("gda-feeds", "status", {
      code: "INTERNAL", message: (err as Error).message, detail: null,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/feeds/sync — trigger manual sync (admin only)
// ---------------------------------------------------------------------------
router.post(
  "/sync",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { feed, days_back, naics_codes, keywords } = req.body as {
        feed?: "sam" | "fpds" | "all";
        days_back?: number;
        naics_codes?: string[];
        keywords?: string[];
      };

      const daysBack = Math.min(days_back ?? 30, 365); // max 1 year
      let results: SyncResult[];

      log.info("manual_feed_sync", { feed: feed ?? "all", daysBack });

      if (feed === "sam") {
        results = [await syncSAMOpportunities(daysBack, naics_codes)];
      } else if (feed === "fpds") {
        results = [await syncFPDSAwards(daysBack, keywords)];
      } else {
        results = await syncAllFeeds({
          samDaysBack: daysBack,
          fpdsDaysBack: daysBack,
          naicsFilter: naics_codes,
          fpdsKeywords: keywords,
        });
      }

      res.json(successEnvelope("gda-feeds", "sync", {
        results,
        timestamp: new Date().toISOString(),
      }));
    } catch (err) {
      log.error("feed_sync_error", { error: (err as Error).message });
      res.status(500).json(errorEnvelope("gda-feeds", "sync", {
        code: "INTERNAL", message: (err as Error).message, detail: null,
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/feeds/sam/history — SAM scan run history
// ---------------------------------------------------------------------------
router.get("/sam/history", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.json(successEnvelope("gda-feeds", "sam-history", { runs: [] }));
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, started_at, completed_at, status, opportunities_found, new_matches,
              naics_codes_scanned, error
       FROM sam_scan_runs ORDER BY started_at DESC LIMIT 20`,
    );

    res.json(successEnvelope("gda-feeds", "sam-history", { runs: rows }));
  } catch (err) {
    res.status(500).json(errorEnvelope("gda-feeds", "sam-history", {
      code: "INTERNAL", message: (err as Error).message, detail: null,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /api/feeds/config — update feed configuration (admin only)
// ---------------------------------------------------------------------------
router.post(
  "/config",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { naics_codes, keywords, sync_interval_hours } = req.body as {
        naics_codes?: string[];
        keywords?: string[];
        sync_interval_hours?: number;
      };

      // Store config in DB for persistence
      const pool = getPool();
      if (pool) {
        await pool.query(`
          INSERT INTO feed_config (id, naics_codes, keywords, sync_interval_hours, updated_at)
          VALUES ('default', $1, $2, $3, NOW())
          ON CONFLICT (id) DO UPDATE SET
            naics_codes = EXCLUDED.naics_codes,
            keywords = EXCLUDED.keywords,
            sync_interval_hours = EXCLUDED.sync_interval_hours,
            updated_at = NOW()
        `, [naics_codes ?? [], keywords ?? [], sync_interval_hours ?? 6]);
      }

      res.json(successEnvelope("gda-feeds", "config", {
        naics_codes: naics_codes ?? [],
        keywords: keywords ?? [],
        sync_interval_hours: sync_interval_hours ?? 6,
        updated: true,
      }));
    } catch (err) {
      res.status(500).json(errorEnvelope("gda-feeds", "config", {
        code: "INTERNAL", message: (err as Error).message, detail: null,
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/feeds/config — get feed configuration
// ---------------------------------------------------------------------------
router.get("/config", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (pool) {
      try {
        const { rows } = await pool.query("SELECT * FROM feed_config WHERE id = 'default'");
        if (rows.length > 0) {
          res.json(successEnvelope("gda-feeds", "config", rows[0]));
          return;
        }
      } catch { /* fall through */ }
    }

    res.json(successEnvelope("gda-feeds", "config", {
      naics_codes: [],
      keywords: [],
      sync_interval_hours: 6,
    }));
  } catch (err) {
    res.status(500).json(errorEnvelope("gda-feeds", "config", {
      code: "INTERNAL", message: (err as Error).message, detail: null,
    }));
  }
});

export default router;
