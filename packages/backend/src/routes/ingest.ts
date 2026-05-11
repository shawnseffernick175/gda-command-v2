/**
 * Data ingestion endpoints — receive live data pushes from n8n cron jobs
 * and store in PostgreSQL. These endpoints replace the mock→DB seeding pattern
 * with real-time data from SAM.gov, FPDS, competitor scans, etc.
 *
 * Auth: Requires x-gda-key header matching GDA_WEBHOOK_KEY env var.
 * This is the same key used by n8n webhook auth, so n8n can call these endpoints.
 */

import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";

const router = Router();

function verifyIngestKey(req: import("express").Request, res: import("express").Response): boolean {
  const key = process.env.GDA_WEBHOOK_KEY;
  if (!key) {
    res.status(503).json(errorEnvelope("gda-ingest", "auth", {
      code: "NOT_CONFIGURED",
      message: "GDA_WEBHOOK_KEY not set — ingestion disabled",
      detail: null,
    }));
    return false;
  }
  const provided = req.headers["x-gda-key"] as string;
  if (provided !== key) {
    res.status(401).json(errorEnvelope("gda-ingest", "auth", {
      code: "UNAUTHORIZED",
      message: "Invalid or missing x-gda-key header",
      detail: null,
    }));
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/ingest/opportunities — Upsert opportunities from SAM.gov / n8n
// ---------------------------------------------------------------------------
router.post("/opportunities", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "opportunities", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }

  const items = Array.isArray(req.body) ? req.body : (req.body.opportunities ?? [req.body]);
  let upserted = 0;
  let errors = 0;

  for (const opp of items) {
    try {
      await pool.query(`
        INSERT INTO opportunities (id, title, agency, department, status, score,
          value_estimated, naics, psc, due_date, solicitation_number,
          set_aside, place_of_performance, incumbent, tags, raw_source_url,
          created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          agency = EXCLUDED.agency,
          department = EXCLUDED.department,
          status = EXCLUDED.status,
          score = EXCLUDED.score,
          value_estimated = EXCLUDED.value_estimated,
          naics = EXCLUDED.naics,
          psc = EXCLUDED.psc,
          due_date = EXCLUDED.due_date,
          solicitation_number = EXCLUDED.solicitation_number,
          set_aside = EXCLUDED.set_aside,
          place_of_performance = EXCLUDED.place_of_performance,
          incumbent = EXCLUDED.incumbent,
          tags = EXCLUDED.tags,
          raw_source_url = EXCLUDED.raw_source_url,
          updated_at = NOW()
      `, [
        opp.id, opp.title, opp.agency ?? null, opp.department ?? null,
        opp.status ?? "discovery", opp.score ?? 0, opp.value_estimated ?? null,
        opp.naics ?? null, opp.psc ?? null, opp.due_date ?? null,
        opp.solicitation_number ?? null, opp.set_aside ?? null,
        opp.place_of_performance ?? null, opp.incumbent ?? null,
        opp.tags && Array.isArray(opp.tags) ? `{${opp.tags.join(",")}}` : "{}", opp.raw_source_url ?? null,
        opp.created_at ?? new Date().toISOString(),
        opp.updated_at ?? new Date().toISOString(),
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] opp error: ${(e as Error).message}\n`);
    }
  }

  res.json(successEnvelope("gda-ingest", "opportunities", {
    upserted,
    errors,
    total: items.length,
    timestamp: new Date().toISOString(),
  }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/competitors — Upsert competitor profiles from n8n scans
// ---------------------------------------------------------------------------
router.post("/competitors", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "competitors", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }

  const items = Array.isArray(req.body) ? req.body : (req.body.competitors ?? [req.body]);
  let upserted = 0;
  let errors = 0;

  for (const comp of items) {
    try {
      await pool.query(`
        INSERT INTO competitor_profiles (id, name, threat_score, contracts_won,
          contracts_value, primary_naics, strengths, weaknesses, recent_wins,
          watch_status, last_updated)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          threat_score = EXCLUDED.threat_score,
          contracts_won = EXCLUDED.contracts_won,
          contracts_value = EXCLUDED.contracts_value,
          primary_naics = EXCLUDED.primary_naics,
          strengths = EXCLUDED.strengths,
          weaknesses = EXCLUDED.weaknesses,
          recent_wins = EXCLUDED.recent_wins,
          watch_status = EXCLUDED.watch_status,
          last_updated = NOW()
      `, [
        comp.id, comp.name, comp.threat_score ?? 0,
        comp.contracts_won ?? 0, comp.contracts_value ?? 0,
        comp.primary_naics ?? [], comp.strengths ?? [],
        comp.weaknesses ?? [], comp.recent_wins ?? [],
        comp.watch_status ?? "active",
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] competitor error: ${(e as Error).message}\n`);
    }
  }

  res.json(successEnvelope("gda-ingest", "competitors", {
    upserted, errors, total: items.length, timestamp: new Date().toISOString(),
  }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/intel — Push intelligence feed items from n8n crawlers
// ---------------------------------------------------------------------------
router.post("/intel", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "intel", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }

  const items = Array.isArray(req.body) ? req.body : (req.body.items ?? [req.body]);
  let inserted = 0;
  let errors = 0;

  for (const item of items) {
    try {
      await pool.query(`
        INSERT INTO intel_items (id, title, category, priority, source, summary, url,
          related_opportunity_id, published_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          category = EXCLUDED.category,
          priority = EXCLUDED.priority,
          source = EXCLUDED.source,
          summary = EXCLUDED.summary,
          url = EXCLUDED.url,
          related_opportunity_id = EXCLUDED.related_opportunity_id
      `, [
        item.id, item.title, item.category ?? "general", item.priority ?? "medium",
        item.source ?? "n8n", item.summary ?? null, item.url ?? null,
        item.related_opportunity_id ?? null,
        item.published_at ?? new Date().toISOString(),
      ]);
      inserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] intel error: ${(e as Error).message}\n`);
    }
  }

  res.json(successEnvelope("gda-ingest", "intel", {
    inserted, errors, total: items.length, timestamp: new Date().toISOString(),
  }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/sam-opportunities — SAM.gov opportunity upsert
// ---------------------------------------------------------------------------
router.post("/sam-opportunities", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "sam-opportunities", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }

  const items = Array.isArray(req.body) ? req.body : (req.body.opportunities ?? [req.body]);
  let upserted = 0;
  let errors = 0;

  for (const opp of items) {
    try {
      await pool.query(`
        INSERT INTO sam_opportunities (id, notice_id, title, agency, office,
          naics_code, set_aside_code, response_deadline, posted_date,
          estimated_value, description, sol_number, url,
          relevance_score, scan_status, matched_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          agency = EXCLUDED.agency,
          office = EXCLUDED.office,
          naics_code = EXCLUDED.naics_code,
          set_aside_code = EXCLUDED.set_aside_code,
          response_deadline = EXCLUDED.response_deadline,
          estimated_value = EXCLUDED.estimated_value,
          description = EXCLUDED.description,
          sol_number = EXCLUDED.sol_number,
          url = EXCLUDED.url,
          relevance_score = EXCLUDED.relevance_score,
          updated_at = NOW()
      `, [
        opp.id, opp.notice_id ?? null, opp.title,
        opp.agency ?? null, opp.office ?? null,
        opp.naics_code ?? null, opp.set_aside_code ?? null,
        opp.response_deadline ?? null, opp.posted_date ?? null,
        opp.estimated_value ?? null, opp.description ?? null,
        opp.sol_number ?? null, opp.url ?? null,
        opp.relevance_score ?? null, opp.scan_status ?? "new",
        opp.matched_at ?? null,
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] sam error: ${(e as Error).message}\n`);
    }
  }

  res.json(successEnvelope("gda-ingest", "sam-opportunities", {
    upserted, errors, total: items.length, timestamp: new Date().toISOString(),
  }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/fpds-awards — FPDS award data from n8n cron
// ---------------------------------------------------------------------------
router.post("/fpds-awards", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;

  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "fpds-awards", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }

  const items = Array.isArray(req.body) ? req.body : (req.body.awards ?? [req.body]);
  let upserted = 0;
  let errors = 0;

  for (const award of items) {
    try {
      await pool.query(`
        INSERT INTO fpds_awards (id, piid, title, agency, vendor, vendor_duns,
          award_amount, ceiling_amount, award_date,
          period_of_performance_start, period_of_performance_end,
          award_type, competition_type, naics, psc, place_of_performance,
          is_competitor, competitor_name, is_recompete_candidate, recompete_date,
          created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          vendor = EXCLUDED.vendor,
          award_amount = EXCLUDED.award_amount,
          ceiling_amount = EXCLUDED.ceiling_amount,
          is_competitor = EXCLUDED.is_competitor,
          competitor_name = EXCLUDED.competitor_name,
          is_recompete_candidate = EXCLUDED.is_recompete_candidate,
          recompete_date = EXCLUDED.recompete_date,
          updated_at = NOW()
      `, [
        award.id, award.piid ?? "", award.title ?? "",
        award.agency ?? "", award.vendor ?? "",
        award.vendor_duns ?? null, award.award_amount ?? 0,
        award.ceiling_amount ?? null, award.award_date ?? new Date().toISOString(),
        award.period_of_performance_start ?? null,
        award.period_of_performance_end ?? null,
        award.award_type ?? "unknown", award.competition_type ?? "unknown",
        award.naics ?? null, award.psc ?? null,
        award.place_of_performance ?? null,
        award.is_competitor ?? false, award.competitor_name ?? null,
        award.is_recompete_candidate ?? false, award.recompete_date ?? null,
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] fpds error: ${(e as Error).message}\n`);
    }
  }

  res.json(successEnvelope("gda-ingest", "fpds-awards", {
    upserted, errors, total: items.length, timestamp: new Date().toISOString(),
  }));
});

// ---------------------------------------------------------------------------
// GET /api/ingest/status — Ingestion health check + registry summary
// ---------------------------------------------------------------------------
router.get("/status", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  let dbCounts: Record<string, number> = {};
  if (pool) {
    try {
      const tables = ["opportunities", "competitor_profiles", "intel_items", "sam_opportunities", "fpds_awards"];
      for (const table of tables) {
        const { rows } = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        dbCounts[table] = parseInt(rows[0].count, 10);
      }
    } catch { /* table may not exist */ }
  }

  const { getRegistrySummary } = await import("../lib/webhook-registry");
  const webhooks = getRegistrySummary();

  res.json(successEnvelope("gda-ingest", "status", {
    dbConnected: !!pool,
    recordCounts: dbCounts,
    webhookRegistry: webhooks,
    n8nBaseUrl: process.env.N8N_BASE_URL ?? null,
    timestamp: new Date().toISOString(),
  }));
});

export default router;
