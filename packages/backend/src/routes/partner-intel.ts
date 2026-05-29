import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { log } from "../lib/logger";
import { attachSources } from "../lib/source-validator";
import type { SourceRef } from "../lib/source-validator";
import { fpdsUrl } from "../services/sources/fpds";
import { usaspendingUrl } from "../services/sources/usaspending";

const router = Router();

function requireKey(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
): void {
  const gdaKey = process.env.GDA_WEBHOOK_KEY ?? "";
  const key = req.headers["x-gda-key"] as string | undefined;
  if (!gdaKey || key !== gdaKey) {
    res.status(401).json(
      errorEnvelope("partner-intel", "auth", {
        code: "UNAUTHORIZED",
        message: "Missing or invalid x-gda-key",
        detail: null,
      }),
    );
    return;
  }
  next();
}

const VALID_PARTNER_TAGS = ["riverstone", "pd_systems"];

// GET /api/partner-intel/profiles
router.get("/profiles", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "profiles", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `SELECT pip.*,
              our.display_name, our.anchor_company, our.uei, our.cage,
              our.primary_naics, our.notes AS ou_notes
       FROM partner_intel_profiles pip
       JOIN ou_registry our ON our.ou_tag = pip.ou_tag
       ORDER BY pip.ou_tag`,
    );

    res.json(
      successEnvelope("partner-intel", "profiles", {
        profiles: result.rows,
      }),
    );
  } catch (err) {
    log.error("partner_intel_profiles_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "profiles", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// GET /api/partner-intel/profiles/:ou_tag
router.get("/profiles/:ou_tag", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "profile", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { ou_tag } = req.params;
    if (!VALID_PARTNER_TAGS.includes(ou_tag)) {
      res.status(404).json(
        errorEnvelope("partner-intel", "profile", {
          code: "NOT_FOUND",
          message: `${ou_tag} is not a partner profile`,
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `SELECT pip.*,
              our.display_name, our.anchor_company, our.uei, our.cage,
              our.primary_naics, our.notes AS ou_notes
       FROM partner_intel_profiles pip
       JOIN ou_registry our ON our.ou_tag = pip.ou_tag
       WHERE pip.ou_tag = $1`,
      [ou_tag],
    );

    if (result.rows.length === 0) {
      res.status(404).json(
        errorEnvelope("partner-intel", "profile", {
          code: "NOT_FOUND",
          message: "Profile not found",
          detail: null,
        }),
      );
      return;
    }

    res.json(
      successEnvelope("partner-intel", "profile", result.rows[0]),
    );
  } catch (err) {
    log.error("partner_intel_profile_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "profile", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/partner-intel/profiles/sync
router.post("/profiles/sync", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "sync", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { ou_tag } = req.body;
    if (!ou_tag || !VALID_PARTNER_TAGS.includes(ou_tag)) {
      res.status(400).json(
        errorEnvelope("partner-intel", "sync", {
          code: "VALIDATION_ERROR",
          message: "ou_tag must be riverstone or pd_systems",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `UPDATE partner_intel_profiles SET last_synced_at = NOW() WHERE ou_tag = $1 RETURNING *`,
      [ou_tag],
    );

    res.json(
      successEnvelope("partner-intel", "sync", result.rows[0]),
    );
  } catch (err) {
    log.error("partner_intel_sync_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "sync", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// GET /api/partner-intel/awards
router.get("/awards", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "awards", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { partner_ou_tag, page, per_page } = req.query;
    const limit = Math.min(Number(per_page) || 25, 100);
    const offset = ((Number(page) || 1) - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (partner_ou_tag) {
      conditions.push(`partner_ou_tag = $${paramIndex++}`);
      params.push(partner_ou_tag);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM partner_awards ${where}`,
      params,
    );

    const dataResult = await pool.query(
      `SELECT * FROM partner_awards ${where} ORDER BY awarded_at DESC NULLS LAST LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    const now = new Date().toISOString();
    const sourcedAwards = dataResult.rows.map((row: Record<string, unknown>) => {
      const contractId = row.contract_id ? String(row.contract_id) : null;
      const fpdsSource: SourceRef[] = contractId
        ? [{ kind: "fpds", title: `FPDS ${contractId}`, url: fpdsUrl(contractId), retrieved_at: now }]
        : [];
      const usaSource: SourceRef[] = contractId
        ? [{ kind: "usaspending", title: `USAspending ${contractId}`, url: usaspendingUrl(contractId), retrieved_at: now }]
        : [];
      const combinedSources = [...fpdsSource, ...usaSource];

      const fieldMap: Record<string, SourceRef[]> = {
        contract_id: combinedSources,
        customer: combinedSources,
        value: combinedSources,
        awarded_at: combinedSources,
      };

      return attachSources(row, fieldMap, [
        "partner_ou_tag", "source", "created_at", "updated_at",
      ]);
    });

    res.json(
      successEnvelope("partner-intel", "awards", {
        awards: sourcedAwards,
        total: Number(countResult.rows[0].count),
        page: Number(page) || 1,
        per_page: limit,
      }),
    );
  } catch (err) {
    log.error("partner_intel_awards_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "awards", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/partner-intel/awards/batch
router.post("/awards/batch", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "awards-batch", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { partner_ou_tag, awards } = req.body;
    if (!partner_ou_tag || !VALID_PARTNER_TAGS.includes(partner_ou_tag)) {
      res.status(400).json(
        errorEnvelope("partner-intel", "awards-batch", {
          code: "VALIDATION_ERROR",
          message: "partner_ou_tag must be riverstone or pd_systems",
          detail: null,
        }),
      );
      return;
    }

    if (!Array.isArray(awards)) {
      res.status(400).json(
        errorEnvelope("partner-intel", "awards-batch", {
          code: "VALIDATION_ERROR",
          message: "awards must be an array",
          detail: null,
        }),
      );
      return;
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const award of awards) {
      try {
        const result = await pool.query(
          `INSERT INTO partner_awards (partner_ou_tag, contract_id, customer, value, awarded_at, source)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (partner_ou_tag, contract_id) WHERE contract_id IS NOT NULL DO NOTHING
           RETURNING id`,
          [
            partner_ou_tag,
            award.contract_id || null,
            award.customer || null,
            award.value ?? null,
            award.awarded_at || null,
            award.source || "usaspending",
          ],
        );
        if (result.rows.length > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }

    res.json(
      successEnvelope("partner-intel", "awards-batch", {
        inserted,
        updated,
        skipped,
      }),
    );
  } catch (err) {
    log.error("partner_intel_awards_batch_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "awards-batch", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// GET /api/partner-intel/teaming-flags
router.get("/teaming-flags", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "teaming-flags", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { opportunity_id } = req.query;
    if (!opportunity_id) {
      res.status(400).json(
        errorEnvelope("partner-intel", "teaming-flags", {
          code: "VALIDATION_ERROR",
          message: "opportunity_id query param is required",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `SELECT tf.*, o.title AS opportunity_title
       FROM teaming_flags tf
       JOIN opportunities o ON o.id = tf.opportunity_id
       WHERE tf.opportunity_id = $1
       ORDER BY tf.created_at`,
      [opportunity_id],
    );

    res.json(
      successEnvelope("partner-intel", "teaming-flags", {
        flags: result.rows,
      }),
    );
  } catch (err) {
    log.error("partner_intel_teaming_flags_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "teaming-flags", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// GET /api/partner-intel/news
router.get("/news", async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "news", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { partner_ou_tag, page, per_page } = req.query;
    const limit = Math.min(Number(per_page) || 25, 100);
    const offset = ((Number(page) || 1) - 1) * limit;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (partner_ou_tag) {
      conditions.push(`partner_ou_tag = $${paramIndex++}`);
      params.push(partner_ou_tag);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const dataResult = await pool.query(
      `SELECT * FROM partner_news_items ${where} ORDER BY published_at DESC NULLS LAST LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    res.json(
      successEnvelope("partner-intel", "news", {
        items: dataResult.rows,
      }),
    );
  } catch (err) {
    log.error("partner_intel_news_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "news", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// POST /api/partner-intel/news/batch
router.post("/news/batch", requireKey, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "news-batch", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const { partner_ou_tag, items } = req.body;
    if (!partner_ou_tag || !VALID_PARTNER_TAGS.includes(partner_ou_tag)) {
      res.status(400).json(
        errorEnvelope("partner-intel", "news-batch", {
          code: "VALIDATION_ERROR",
          message: "partner_ou_tag must be riverstone or pd_systems",
          detail: null,
        }),
      );
      return;
    }

    if (!Array.isArray(items)) {
      res.status(400).json(
        errorEnvelope("partner-intel", "news-batch", {
          code: "VALIDATION_ERROR",
          message: "items must be an array",
          detail: null,
        }),
      );
      return;
    }

    let inserted = 0;
    let skipped = 0;

    for (const item of items) {
      try {
        // Upsert by url + partner_ou_tag
        if (item.url) {
          const existing = await pool.query(
            "SELECT id FROM partner_news_items WHERE url = $1 AND partner_ou_tag = $2",
            [item.url, partner_ou_tag],
          );
          if (existing.rows.length > 0) {
            skipped++;
            continue;
          }
        }

        await pool.query(
          `INSERT INTO partner_news_items (partner_ou_tag, headline, url, source, published_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (partner_ou_tag, url) WHERE url IS NOT NULL DO NOTHING`,
          [
            partner_ou_tag,
            item.headline || "Untitled",
            item.url || null,
            item.source || null,
            item.published_at || null,
          ],
        );
        inserted++;
      } catch {
        skipped++;
      }
    }

    res.json(
      successEnvelope("partner-intel", "news-batch", {
        inserted,
        skipped,
      }),
    );
  } catch (err) {
    log.error("partner_intel_news_batch_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "news-batch", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

// GET /api/partner-intel/teaming-summary
router.get("/teaming-summary", async (_req, res) => {
  try {
    const pool = getPool();
    if (!pool) {
      res.status(503).json(
        errorEnvelope("partner-intel", "teaming-summary", {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured",
          detail: null,
        }),
      );
      return;
    }

    const result = await pool.query(
      `SELECT reason, suggested_partner, COUNT(*) AS count
       FROM teaming_flags
       GROUP BY reason, suggested_partner
       ORDER BY reason`,
    );

    res.json(
      successEnvelope("partner-intel", "teaming-summary", {
        summary: result.rows,
      }),
    );
  } catch (err) {
    log.error("partner_intel_teaming_summary_error", {
      error: String((err as Error).message),
    });
    res.status(500).json(
      errorEnvelope("partner-intel", "teaming-summary", {
        code: "INTERNAL_ERROR",
        message: String((err as Error).message),
        detail: null,
      }),
    );
  }
});

export default router;
