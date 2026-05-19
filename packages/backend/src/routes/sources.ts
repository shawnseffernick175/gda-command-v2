import { Router } from "express";
import { log } from "../lib/logger";
import type { SourceRegistryEntry, SourceSyncRun } from "@gda/shared";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/sources — list all registered data sources
// ---------------------------------------------------------------------------
router.get("/", async (_req, res) => {
  try {
    const pool = getPool();

    if (pool) {
      try {
        const result = await pool.query(
          `SELECT id, name, source_type, category, base_url, auth_type, enabled,
                  sync_frequency, search_params, last_sync_at, last_sync_status,
                  last_sync_count, total_synced, error_count, last_error,
                  created_at, updated_at
           FROM source_registry ORDER BY enabled DESC, name`
        );

        const sources: SourceRegistryEntry[] = result.rows.map((r) => ({
          ...r,
          last_sync_at: r.last_sync_at?.toISOString() ?? null,
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
        }));

        const enabledCount = sources.filter((s) => s.enabled).length;
        const totalSynced = sources.reduce((sum, s) => sum + (s.total_synced ?? 0), 0);

        return res.json(
          successEnvelope("sources", "list", {
            sources,
            total: sources.length,
            enabled: enabledCount,
            total_records_synced: totalSynced,
          })
        );
      } catch (err) {
        log.warn("sources_fallback", { error: String(err) });
        // table may not exist — fall through
      }
    }

    res.json(
      successEnvelope("sources", "list", {
        sources: [],
        total: 0,
        enabled: 0,
        total_records_synced: 0,
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("sources", "list", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/sources/:id — get a single source detail
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("sources", "get", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const { rows } = await pool.query("SELECT * FROM source_registry WHERE id = $1", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("sources", "get", {
          code: "NOT_FOUND",
          message: "Source not found",
          detail: null,
        })
      );
    }

    // Get recent sync runs
    const runsResult = await pool.query(
      `SELECT id, source_id, started_at, completed_at, status,
              records_fetched, records_upserted, records_errored,
              duration_ms, error, metadata
       FROM source_sync_runs
       WHERE source_id = $1
       ORDER BY started_at DESC
       LIMIT 20`,
      [req.params.id]
    );

    res.json(
      successEnvelope("sources", "get", {
        source: rows[0],
        recent_runs: runsResult.rows,
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("sources", "get", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// PUT /api/sources/:id — update source configuration (admin only)
// ---------------------------------------------------------------------------
router.put("/:id", requireRole("admin"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("sources", "update", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const { enabled, sync_frequency, search_params } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (enabled !== undefined) {
      updates.push(`enabled = $${idx++}`);
      params.push(enabled);
    }
    if (sync_frequency) {
      updates.push(`sync_frequency = $${idx++}`);
      params.push(sync_frequency);
    }
    if (search_params) {
      updates.push(`search_params = $${idx++}`);
      params.push(JSON.stringify(search_params));
    }

    if (updates.length === 0) {
      return res.status(400).json(
        errorEnvelope("sources", "update", {
          code: "VALIDATION_ERROR",
          message: "No fields to update",
          detail: null,
        })
      );
    }

    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const result = await pool.query(
      `UPDATE source_registry SET ${updates.join(", ")} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("sources", "update", {
          code: "NOT_FOUND",
          message: "Source not found",
          detail: null,
        })
      );
    }

    res.json(successEnvelope("sources", "update", result.rows[0]));
  } catch (err) {
    res.status(500).json(
      errorEnvelope("sources", "update", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/sources/:id/sync — trigger a manual sync for a source (admin only)
// ---------------------------------------------------------------------------
router.post("/:id/sync", requireRole("admin"), async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.status(503).json(
        errorEnvelope("sources", "sync", {
          code: "DB_UNAVAILABLE",
          message: "Database not configured",
          detail: null,
        })
      );
    }

    const { rows } = await pool.query("SELECT * FROM source_registry WHERE id = $1", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json(
        errorEnvelope("sources", "sync", {
          code: "NOT_FOUND",
          message: "Source not found",
          detail: null,
        })
      );
    }

    const source = rows[0];
    const runId = `${source.id}-${Date.now()}`;

    // Record sync run start
    await pool.query(
      `INSERT INTO source_sync_runs (id, source_id, started_at, status)
       VALUES ($1, $2, NOW(), 'running')`,
      [runId, source.id]
    );

    // Update source status
    await pool.query(
      `UPDATE source_registry SET last_sync_status = 'running', updated_at = NOW() WHERE id = $1`,
      [source.id]
    );

    // Trigger the actual sync based on source type (fire-and-forget)
    triggerSourceSync(source.id, runId).catch(() => {
      // errors are recorded in the sync run
    });

    res.json(
      successEnvelope("sources", "sync", {
        run_id: runId,
        source_id: source.id,
        status: "running",
        message: `Sync started for ${source.name}`,
      })
    );
  } catch (err) {
    res.status(500).json(
      errorEnvelope("sources", "sync", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// GET /api/sources/sync/history — recent sync runs across all sources
// ---------------------------------------------------------------------------
router.get("/sync/history", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      return res.json(
        successEnvelope("sources", "sync-history", {
          runs: [],
          total: 0,
        })
      );
    }

    try {
      const result = await pool.query(
        `SELECT r.*, s.name as source_name
         FROM source_sync_runs r
         JOIN source_registry s ON s.id = r.source_id
         ORDER BY r.started_at DESC
         LIMIT 50`
      );

      res.json(
        successEnvelope("sources", "sync-history", {
          runs: result.rows,
          total: result.rows.length,
        })
      );
    } catch (err) {
      log.warn("sources_fallback", { error: String(err) });
      res.json(
        successEnvelope("sources", "sync-history", {
          runs: [],
          total: 0,
        })
      );
    }
  } catch (err) {
    res.status(500).json(
      errorEnvelope("sources", "sync-history", {
        code: "INTERNAL",
        message: String(err),
        detail: null,
      })
    );
  }
});

// ---------------------------------------------------------------------------
// Internal: trigger sync for a specific source
// ---------------------------------------------------------------------------
async function triggerSourceSync(sourceId: string, runId: string): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const start = Date.now();
  let fetched = 0;
  let upserted = 0;
  let errored = 0;
  let error: string | undefined;

  try {
    switch (sourceId) {
      case "sam-gov": {
        const { syncSAMOpportunities } = await import("../lib/feed-sync");
        const result = await syncSAMOpportunities();
        fetched = result.fetched;
        upserted = result.upserted;
        errored = result.errors;
        if (result.status === "error") error = result.error;
        break;
      }
      case "fpds": {
        const { syncFPDSAwards } = await import("../lib/feed-sync");
        const result = await syncFPDSAwards();
        fetched = result.fetched;
        upserted = result.upserted;
        errored = result.errors;
        if (result.status === "error") error = result.error;
        break;
      }
      case "govtribe": {
        const { syncGovSources } = await import("../lib/gov-sources");
        const results = await syncGovSources();
        const gt = results.find((r) => r.source === "govtribe");
        if (gt) {
          fetched = gt.fetched;
          upserted = gt.upserted;
          if (gt.error) error = gt.error;
        }
        break;
      }
      default:
        error = `No sync handler for source: ${sourceId}`;
    }
  } catch (e) {
    error = (e as Error).message;
    errored = 1;
  }

  const durationMs = Date.now() - start;

  // Record sync run completion
  await pool.query(
    `UPDATE source_sync_runs
     SET completed_at = NOW(), status = $1, records_fetched = $2,
         records_upserted = $3, records_errored = $4, duration_ms = $5, error = $6
     WHERE id = $7`,
    [error ? "error" : "success", fetched, upserted, errored, durationMs, error ?? null, runId]
  );

  // Update source registry
  await pool.query(
    `UPDATE source_registry
     SET last_sync_at = NOW(), last_sync_status = $1, last_sync_count = $2,
         total_synced = total_synced + $2, error_count = CASE WHEN $1 = 'error' THEN error_count + 1 ELSE error_count END,
         last_error = $3, updated_at = NOW()
     WHERE id = $4`,
    [error ? "error" : "success", upserted, error ?? null, sourceId]
  );
}

export default router;
