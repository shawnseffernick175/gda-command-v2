/**
 * Data ingestion endpoints — receive live data pushes from n8n cron jobs
 * and store in PostgreSQL. These endpoints replace the mock→DB seeding pattern
 * with real-time data from SAM.gov, FPDS, competitor scans, etc.
 *
 * Auth: Requires x-gda-key header matching GDA_WEBHOOK_KEY env var.
 * This is the same key used by n8n webhook auth, so n8n can call these endpoints.
 */

import { Router } from "express";
import { log } from "../lib/logger";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { notify } from "../lib/email";
import { queueCaptureCoachIfNeeded } from "../agents/auto-capture-coach";

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
        "discovery", opp.score ?? 0, opp.value_estimated ?? null,
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

  // Auto-trigger Capture Coach for ingested opportunities (fire-and-forget)
  for (const opp of items) {
    if (opp.id) queueCaptureCoachIfNeeded(opp.id);
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
        INSERT INTO sam_opportunities (id, notice_id, title, agency, sub_agency,
          type, set_aside, naics, naics_description, psc,
          value_estimate, response_deadline, posted_date,
          place_of_performance, relevance_score, relevance_reasons,
          ai_summary, scan_status, matched_naics, matched_keywords, sam_url,
          created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          agency = EXCLUDED.agency,
          sub_agency = EXCLUDED.sub_agency,
          type = EXCLUDED.type,
          set_aside = EXCLUDED.set_aside,
          naics = EXCLUDED.naics,
          naics_description = EXCLUDED.naics_description,
          psc = EXCLUDED.psc,
          value_estimate = EXCLUDED.value_estimate,
          response_deadline = EXCLUDED.response_deadline,
          place_of_performance = EXCLUDED.place_of_performance,
          relevance_score = EXCLUDED.relevance_score,
          relevance_reasons = EXCLUDED.relevance_reasons,
          ai_summary = EXCLUDED.ai_summary,
          matched_naics = EXCLUDED.matched_naics,
          matched_keywords = EXCLUDED.matched_keywords,
          sam_url = EXCLUDED.sam_url
      `, [
        opp.id, opp.notice_id ?? opp.id, opp.title,
        opp.agency ?? null, opp.sub_agency ?? null,
        opp.type ?? "unknown", opp.set_aside ?? null,
        opp.naics ?? opp.naics_code ?? null, opp.naics_description ?? null,
        opp.psc ?? null, opp.value_estimate ?? opp.estimated_value ?? null,
        opp.response_deadline ?? null, opp.posted_date ?? null,
        opp.place_of_performance ?? null, opp.relevance_score ?? 0,
        opp.relevance_reasons ?? [], opp.ai_summary ?? null,
        opp.scan_status ?? "new", opp.matched_naics ?? false,
        opp.matched_keywords ?? [], opp.sam_url ?? opp.url ?? null,
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
// POST /api/ingest/capture-plans — Upsert capture plans from n8n
// ---------------------------------------------------------------------------
router.post("/capture-plans", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "capture-plans", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.plans ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const p of items) {
    try {
      await pool.query(`
        INSERT INTO capture_plans (id, opportunity_id, opportunity_title, agency, phase,
          pwin, value_estimated, capture_manager, bid_decision, teaming_partners,
          milestones, gate_reviews, win_themes, discriminators, risks, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          opportunity_title = EXCLUDED.opportunity_title, agency = EXCLUDED.agency,
          phase = EXCLUDED.phase, pwin = EXCLUDED.pwin, value_estimated = EXCLUDED.value_estimated,
          capture_manager = EXCLUDED.capture_manager, bid_decision = EXCLUDED.bid_decision,
          teaming_partners = EXCLUDED.teaming_partners, milestones = EXCLUDED.milestones,
          gate_reviews = EXCLUDED.gate_reviews, win_themes = EXCLUDED.win_themes,
          discriminators = EXCLUDED.discriminators, risks = EXCLUDED.risks, updated_at = NOW()
      `, [
        p.id, p.opportunity_id ?? null, p.opportunity_title, p.agency ?? null,
        p.phase ?? "pre_rfp", p.pwin ?? 0, p.value_estimated ?? null,
        p.capture_manager ?? null, p.bid_decision ?? "pending",
        JSON.stringify(p.teaming_partners ?? []), JSON.stringify(p.milestones ?? []),
        JSON.stringify(p.gate_reviews ?? []),
        p.win_themes ?? [], p.discriminators ?? [],
        JSON.stringify(p.risks ?? []),
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] capture-plan error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "capture-plans", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/contacts — Upsert contacts from n8n CRM sync
// ---------------------------------------------------------------------------
router.post("/contacts", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "contacts", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.contacts ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const c of items) {
    try {
      await pool.query(`
        INSERT INTO contacts (id, first_name, last_name, title, agency, department,
          email, phone, status, relationship_strength, last_contact_date,
          relationship_history, meeting_notes, tags)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
          first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
          title = EXCLUDED.title, agency = EXCLUDED.agency, department = EXCLUDED.department,
          email = EXCLUDED.email, phone = EXCLUDED.phone, status = EXCLUDED.status,
          relationship_strength = EXCLUDED.relationship_strength,
          last_contact_date = EXCLUDED.last_contact_date,
          relationship_history = EXCLUDED.relationship_history,
          meeting_notes = EXCLUDED.meeting_notes, tags = EXCLUDED.tags
      `, [
        c.id, c.first_name, c.last_name, c.title ?? null,
        c.agency ?? null, c.department ?? null, c.email ?? null, c.phone ?? null,
        c.status ?? "active", c.relationship_strength ?? "new",
        c.last_contact_date ?? null, c.relationship_history ?? null,
        JSON.stringify(c.meeting_notes ?? []), c.tags ?? [],
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] contact error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "contacts", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/compliance — Upsert compliance requirements
// ---------------------------------------------------------------------------
router.post("/compliance", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "compliance", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.requirements ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const r of items) {
    try {
      await pool.query(`
        INSERT INTO compliance_requirements (id, solicitation_id, solicitation_title,
          section, requirement, category, status, evidence, responsible_party, notes,
          related_clause_ids, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
        ON CONFLICT (id) DO UPDATE SET
          solicitation_title = EXCLUDED.solicitation_title, section = EXCLUDED.section,
          requirement = EXCLUDED.requirement, category = EXCLUDED.category,
          status = EXCLUDED.status, evidence = EXCLUDED.evidence,
          responsible_party = EXCLUDED.responsible_party, notes = EXCLUDED.notes,
          related_clause_ids = EXCLUDED.related_clause_ids, updated_at = NOW()
      `, [
        r.id, r.solicitation_id, r.solicitation_title, r.section, r.requirement,
        r.category ?? "other", r.status ?? "gap", r.evidence ?? null,
        r.responsible_party ?? "unassigned", r.notes ?? null,
        r.related_clause_ids ?? [],
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] compliance error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "compliance", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/anomalies — Upsert anomalies from detection engine
// ---------------------------------------------------------------------------
router.post("/anomalies", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "anomalies", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.anomalies ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const a of items) {
    try {
      await pool.query(`
        INSERT INTO anomalies (id, category, severity, status, title, description,
          opportunity_id, opportunity_title, agency, detected_at,
          metric_name, metric_value, baseline_value, deviation_pct, trend,
          root_cause, recommended_actions)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO UPDATE SET
          severity = EXCLUDED.severity, title = EXCLUDED.title,
          description = EXCLUDED.description, metric_name = EXCLUDED.metric_name,
          metric_value = EXCLUDED.metric_value, baseline_value = EXCLUDED.baseline_value,
          deviation_pct = EXCLUDED.deviation_pct, trend = EXCLUDED.trend,
          root_cause = EXCLUDED.root_cause, recommended_actions = EXCLUDED.recommended_actions
      `, [
        a.id, a.category, a.severity ?? "medium", a.status ?? "active",
        a.title, a.description ?? null, a.opportunity_id ?? null,
        a.opportunity_title ?? null, a.agency ?? null,
        a.detected_at ?? new Date().toISOString(),
        a.metric_name ?? null, a.metric_value ?? null, a.baseline_value ?? null,
        a.deviation_pct ?? null, JSON.stringify(a.trend ?? []),
        a.root_cause ?? null, a.recommended_actions ?? [],
      ]);
      upserted++;

      // Email notification for critical/high anomalies
      if (a.severity === "critical" || a.severity === "high") {
        notify({
          title: `Anomaly: ${a.title}`,
          message: a.description ?? `${a.severity} anomaly detected`,
          severity: a.severity === "critical" ? "critical" : "warning",
          category: "anomaly",
          link: "/anomalies",
          relatedEntityId: a.id,
          relatedEntityType: "anomaly",
          emailTemplate: "anomaly_detected",
          emailData: { title: a.title, severity: a.severity, description: a.description ?? "" },
        }).catch(() => {});
      }
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] anomaly error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "anomalies", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/escalations — Upsert escalations from escalation engine
// ---------------------------------------------------------------------------
router.post("/escalations", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "escalations", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.escalations ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const e2 of items) {
    try {
      await pool.query(`
        INSERT INTO escalations (id, rule_id, rule_name, priority, status, title,
          description, opportunity_id, opportunity_title, agency,
          assigned_to, due_date, triggered_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
        ON CONFLICT (id) DO UPDATE SET
          priority = EXCLUDED.priority, title = EXCLUDED.title,
          description = EXCLUDED.description, assigned_to = EXCLUDED.assigned_to,
          due_date = EXCLUDED.due_date
      `, [
        e2.id, e2.rule_id ?? null, e2.rule_name ?? null, e2.priority ?? "info",
        e2.status ?? "open", e2.title, e2.description ?? null,
        e2.opportunity_id ?? null, e2.opportunity_title ?? null, e2.agency ?? null,
        e2.assigned_to ?? null, e2.due_date ?? null,
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] escalation error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "escalations", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/cpars — Upsert CPARS records from n8n
// ---------------------------------------------------------------------------
router.post("/cpars", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "cpars", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.records ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const c of items) {
    try {
      await pool.query(`
        INSERT INTO cpars_records (id, contract_number, contract_title, agency,
          period_of_performance, contract_value, status, overall_rating,
          quality_rating, schedule_rating, cost_rating, management_rating,
          narrative, key_accomplishments, relevance_tags, matched_opportunities,
          evaluator, evaluation_date, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          contract_title = EXCLUDED.contract_title, agency = EXCLUDED.agency,
          status = EXCLUDED.status, overall_rating = EXCLUDED.overall_rating,
          quality_rating = EXCLUDED.quality_rating, schedule_rating = EXCLUDED.schedule_rating,
          cost_rating = EXCLUDED.cost_rating, management_rating = EXCLUDED.management_rating,
          narrative = EXCLUDED.narrative, key_accomplishments = EXCLUDED.key_accomplishments,
          relevance_tags = EXCLUDED.relevance_tags, matched_opportunities = EXCLUDED.matched_opportunities,
          evaluator = EXCLUDED.evaluator, evaluation_date = EXCLUDED.evaluation_date,
          updated_at = NOW()
      `, [
        c.id, c.contract_number, c.contract_title, c.agency,
        c.period_of_performance ?? null, c.contract_value ?? null,
        c.status ?? "draft", c.overall_rating ?? null,
        c.quality_rating ?? null, c.schedule_rating ?? null,
        c.cost_rating ?? null, c.management_rating ?? null,
        c.narrative ?? null, c.key_accomplishments ?? [],
        c.relevance_tags ?? [], c.matched_opportunities ?? [],
        c.evaluator ?? null, c.evaluation_date ?? null,
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] cpars error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "cpars", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/doctrine — Upsert doctrine drafts from n8n
// ---------------------------------------------------------------------------
router.post("/doctrine", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "doctrine", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.drafts ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const d of items) {
    try {
      await pool.query(`
        INSERT INTO doctrine_drafts (id, sprint_id, component, doc_type, title,
          status, source_pr_number, source_pr_url, body, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title, status = EXCLUDED.status,
          body = EXCLUDED.body, source_pr_number = EXCLUDED.source_pr_number,
          source_pr_url = EXCLUDED.source_pr_url, updated_at = NOW()
      `, [
        d.id, d.sprint_id, d.component, d.doc_type ?? "sprint_notes",
        d.title, d.status ?? "draft", d.source_pr_number ?? null,
        d.source_pr_url ?? null, d.body ?? null,
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] doctrine error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "doctrine", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/prompts — Upsert prompt library entries
// ---------------------------------------------------------------------------
router.post("/prompts", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "prompts", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.prompts ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const p of items) {
    try {
      await pool.query(`
        INSERT INTO prompts (id, name, category, description, template, variables,
          tags, version, is_active, created_by, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, category = EXCLUDED.category,
          description = EXCLUDED.description, template = EXCLUDED.template,
          variables = EXCLUDED.variables, tags = EXCLUDED.tags,
          version = EXCLUDED.version, is_active = EXCLUDED.is_active, updated_at = NOW()
      `, [
        p.id, p.name, p.category, p.description ?? null,
        p.template, p.variables ?? [], p.tags ?? [],
        p.version ?? 1, p.is_active ?? true, p.created_by ?? null,
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] prompt error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "prompts", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/competitor-movements — Upsert competitive movement data
// ---------------------------------------------------------------------------
router.post("/competitor-movements", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "competitor-movements", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.movements ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const m of items) {
    try {
      await pool.query(`
        INSERT INTO competitor_movements (id, competitor_name, movement_type, threat_level,
          title, description, impact_assessment,
          affected_opportunities, source, source_url, verified, detected_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO UPDATE SET
          movement_type = EXCLUDED.movement_type, threat_level = EXCLUDED.threat_level,
          title = EXCLUDED.title, description = EXCLUDED.description,
          impact_assessment = EXCLUDED.impact_assessment,
          affected_opportunities = EXCLUDED.affected_opportunities,
          source = EXCLUDED.source, source_url = EXCLUDED.source_url,
          verified = EXCLUDED.verified
      `, [
        m.id, m.competitor_name, m.movement_type ?? "general", m.threat_level ?? m.severity ?? "medium",
        m.title, m.description ?? null, m.impact_assessment ?? null,
        m.affected_opportunities ?? [], m.source ?? null, m.source_url ?? null,
        m.verified ?? false, m.detected_at ?? new Date().toISOString(),
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] competitor-movement error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "competitor-movements", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
});

// ---------------------------------------------------------------------------
// POST /api/ingest/color-reviews — Upsert color review results
// ---------------------------------------------------------------------------
router.post("/color-reviews", async (req, res) => {
  if (!verifyIngestKey(req, res)) return;
  const pool = getPool();
  if (!pool) {
    return res.status(503).json(errorEnvelope("gda-ingest", "color-reviews", {
      code: "DB_UNAVAILABLE", message: "Database not configured", detail: null,
    }));
  }
  const items = Array.isArray(req.body) ? req.body : (req.body.reviews ?? [req.body]);
  let upserted = 0, errors = 0;
  for (const r of items) {
    try {
      await pool.query(`
        INSERT INTO color_reviews (id, proposal_id, proposal_title, agency, phase, status,
          started_at, completed_at, overall_score, max_score, pass_rate,
          total_checks, passed_checks, failed_checks, warning_checks,
          reviewer, summary, go_no_go, confidence,
          requirement_checks, section_scores, risk_factors,
          created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,NOW(),NOW())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status, reviewer = EXCLUDED.reviewer,
          completed_at = EXCLUDED.completed_at, overall_score = EXCLUDED.overall_score,
          max_score = EXCLUDED.max_score,
          pass_rate = EXCLUDED.pass_rate, total_checks = EXCLUDED.total_checks,
          passed_checks = EXCLUDED.passed_checks, failed_checks = EXCLUDED.failed_checks,
          warning_checks = EXCLUDED.warning_checks, summary = EXCLUDED.summary,
          go_no_go = EXCLUDED.go_no_go, confidence = EXCLUDED.confidence,
          requirement_checks = EXCLUDED.requirement_checks,
          section_scores = EXCLUDED.section_scores,
          risk_factors = EXCLUDED.risk_factors, updated_at = NOW()
      `, [
        r.id, r.proposal_id ?? null, r.proposal_title, r.agency ?? null,
        r.phase ?? "pink", r.status ?? "in_progress",
        r.started_at ?? null, r.completed_at ?? null,
        r.overall_score ?? 0, r.max_score ?? 100, r.pass_rate ?? 0,
        r.total_checks ?? 0, r.passed_checks ?? 0, r.failed_checks ?? 0, r.warning_checks ?? 0,
        r.reviewer ?? null, r.summary ?? null, r.go_no_go ?? null, r.confidence ?? null,
        JSON.stringify(r.requirement_checks ?? []), JSON.stringify(r.section_scores ?? []),
        r.risk_factors ?? [],
      ]);
      upserted++;
    } catch (e) {
      errors++;
      process.stderr.write(`[ingest] color-review error: ${(e as Error).message}\n`);
    }
  }
  res.json(successEnvelope("gda-ingest", "color-reviews", { upserted, errors, total: items.length, timestamp: new Date().toISOString() }));
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
      const tables = [
        "opportunities", "competitor_profiles", "intel_items", "sam_opportunities", "fpds_awards",
        "capture_plans", "contacts", "compliance_requirements", "anomalies", "escalations",
        "cpars_records", "doctrine_drafts", "prompts", "competitor_movements", "color_reviews",
      ];
      for (const table of tables) {
        const { rows } = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        dbCounts[table] = parseInt(rows[0].count, 10);
      }
    } catch (err) { log.warn("ingest_fallback", { error: String(err) }); }
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
