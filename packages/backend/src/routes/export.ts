/**
 * Data export routes — CSV downloads for key data tables.
 */

import { Router, Request, Response } from "express";
import { getPool } from "../lib/db";
import { toCSV } from "../lib/csv-export";
import { requireRole } from "../lib/auth";
import { log } from "../lib/logger";

const router = Router();

function sendCSV(res: Response, filename: string, data: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(data);
}

// GET /api/export/opportunities
router.get("/opportunities", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, title, agency, department, status, score, probability_of_win AS pwin, value_estimated,
              naics, set_aside, due_date, created_at, updated_at
       FROM opportunities ORDER BY created_at DESC`
    );
    sendCSV(res, `gda-opportunities-${dateStamp()}.csv`, toCSV(rows));
  } catch (err) {
    log.error("export_opportunities_error", { error: (err as Error).message });
    res.status(500).json({ error: "Export failed" });
  }
});

// GET /api/export/contacts
router.get("/contacts", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, email, phone, agency, department,
              title, relationship_strength, last_contact_date, meeting_notes, created_at
       FROM contacts ORDER BY last_name, first_name`
    );
    sendCSV(res, `gda-contacts-${dateStamp()}.csv`, toCSV(rows));
  } catch (err) {
    log.error("export_contacts_error", { error: (err as Error).message });
    res.status(500).json({ error: "Export failed" });
  }
});

// GET /api/export/pipeline
router.get("/pipeline", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, title, agency, department, status, score, probability_of_win AS pwin, value_estimated,
              naics, set_aside, due_date, created_at
       FROM opportunities
       WHERE status IN ('qualified', 'pipeline', 'won')
       ORDER BY score DESC`
    );
    sendCSV(res, `gda-pipeline-${dateStamp()}.csv`, toCSV(rows));
  } catch (err) {
    log.error("export_pipeline_error", { error: (err as Error).message });
    res.status(500).json({ error: "Export failed" });
  }
});

// GET /api/export/compliance
router.get("/compliance", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, requirement_id, clause_reference, category, description,
              status, priority, assigned_to, evidence_link, notes, created_at
       FROM compliance ORDER BY created_at DESC`
    );
    sendCSV(res, `gda-compliance-${dateStamp()}.csv`, toCSV(rows));
  } catch (err) {
    log.error("export_compliance_error", { error: (err as Error).message });
    res.status(500).json({ error: "Export failed" });
  }
});

// GET /api/export/cpars
router.get("/cpars", async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, contract_number, contract_title, agency, rating_quality,
              rating_schedule, rating_cost, rating_management, rating_overall,
              narrative, period_start, period_end, status, created_at
       FROM cpars ORDER BY created_at DESC`
    );
    sendCSV(res, `gda-cpars-${dateStamp()}.csv`, toCSV(rows));
  } catch (err) {
    log.error("export_cpars_error", { error: (err as Error).message });
    res.status(500).json({ error: "Export failed" });
  }
});

// GET /api/export/audit-log
router.get("/audit-log", requireRole("admin"), async (_req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) { res.status(503).json({ error: "Database not configured" }); return; }

  try {
    const { rows } = await pool.query(
      `SELECT id, user_email, action, resource_type, resource_id, ip_address, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT 10000`
    );
    sendCSV(res, `gda-audit-log-${dateStamp()}.csv`, toCSV(rows));
  } catch (err) {
    log.error("export_audit_error", { error: (err as Error).message });
    res.status(500).json({ error: "Export failed" });
  }
});

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export default router;
