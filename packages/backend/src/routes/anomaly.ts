import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { getPool } from "../lib/db";
import { requireRole } from "../lib/auth";
import {
  getAnomalies,
  getAnomaly,
  getCompetitorMovements,
  getCompetitorMovement,
  getEscalationRules,
  getEscalations,
  getEscalation,
} from "../data/anomaly-mock";
import { callWebhook } from "../lib/n8n-client";
import { n8nWebhookConfigured } from "../lib/n8n-data";

const router = Router();

// ---------------------------------------------------------------------------
// J-1: Portfolio Anomaly Detection
// ---------------------------------------------------------------------------

router.get("/anomalies", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-anomalies", {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const anomalies = Array.isArray(result.body) ? result.body : (result.body as Record<string, unknown>).anomalies ?? [];
        return res.json(successEnvelope("gda-anomaly", "list-anomalies", { anomalies, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM anomalies ORDER BY detected_at DESC");
      const anomalies = result.rows.map((r) => ({
        ...r,
        detected_at: r.detected_at instanceof Date ? r.detected_at.toISOString() : r.detected_at,
        acknowledged_at: r.acknowledged_at instanceof Date ? r.acknowledged_at.toISOString() : r.acknowledged_at,
        resolved_at: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : r.resolved_at,
        metric_value: r.metric_value !== null ? Number(r.metric_value) : null,
        baseline_value: r.baseline_value !== null ? Number(r.baseline_value) : null,
        deviation_pct: r.deviation_pct !== null ? Number(r.deviation_pct) : null,
      }));
      const active = anomalies.filter((a: { status: string }) => a.status === "active").length;
      const acknowledged = anomalies.filter((a: { status: string }) => a.status === "acknowledged").length;
      const resolved = anomalies.filter((a: { status: string }) => a.status === "resolved").length;
      const dismissed = anomalies.filter((a: { status: string }) => a.status === "dismissed").length;
      const critical = anomalies.filter((a: { severity: string }) => a.severity === "critical").length;
      const high = anomalies.filter((a: { severity: string }) => a.severity === "high").length;

      return res.json(successEnvelope("gda-anomaly", "list-anomalies", {
        anomalies, total: anomalies.length, active, acknowledged, resolved, dismissed, critical, high, source: "db",
      }));
    } catch { /* fall through to mock */ }
  }

  const anomalies = getAnomalies();
  const active = anomalies.filter((a) => a.status === "active").length;
  const acknowledged = anomalies.filter((a) => a.status === "acknowledged").length;
  const resolved = anomalies.filter((a) => a.status === "resolved").length;
  const dismissed = anomalies.filter((a) => a.status === "dismissed").length;
  const critical = anomalies.filter((a) => a.severity === "critical").length;
  const high = anomalies.filter((a) => a.severity === "high").length;

  res.json(successEnvelope("gda-anomaly", "list-anomalies", {
    anomalies, total: anomalies.length, active, acknowledged, resolved, dismissed, critical, high, source: "mock",
  }));
});

router.get("/anomalies/:id", async (req, res) => {
  const { id } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-anomaly", { anomaly_id: id }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-anomaly", "get-anomaly", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM anomalies WHERE id = $1", [id]);
      if (result.rows.length > 0) {
        const r = result.rows[0];
        return res.json(successEnvelope("gda-anomaly", "get-anomaly", {
          ...r,
          detected_at: r.detected_at instanceof Date ? r.detected_at.toISOString() : r.detected_at,
          acknowledged_at: r.acknowledged_at instanceof Date ? r.acknowledged_at.toISOString() : r.acknowledged_at,
          resolved_at: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : r.resolved_at,
          metric_value: r.metric_value !== null ? Number(r.metric_value) : null,
          baseline_value: r.baseline_value !== null ? Number(r.baseline_value) : null,
          deviation_pct: r.deviation_pct !== null ? Number(r.deviation_pct) : null,
          source: "db",
        }));
      }
    } catch { /* fall through */ }
  }

  const anomaly = getAnomaly(id);
  if (!anomaly) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "get-anomaly", {
      code: "NOT_FOUND", message: `Anomaly ${id} not found`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-anomaly", "get-anomaly", { ...anomaly, source: "mock" }));
});

// ---------------------------------------------------------------------------
// J-2: Competitive Movement Tracker
// ---------------------------------------------------------------------------

router.get("/competitor-movements", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-competitor-movements", {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const movements = Array.isArray(result.body) ? result.body : (result.body as Record<string, unknown>).movements ?? [];
        return res.json(successEnvelope("gda-anomaly", "list-movements", { movements, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM competitor_movements ORDER BY detected_at DESC");
      const movements = result.rows.map((r) => ({
        ...r,
        detected_at: r.detected_at instanceof Date ? r.detected_at.toISOString() : r.detected_at,
      }));
      return res.json(successEnvelope("gda-anomaly", "list-movements", {
        movements,
        total: movements.length,
        competitors: [...new Set(movements.map((m: { competitor_name: string }) => m.competitor_name))].length,
        critical: movements.filter((m: { threat_level: string }) => m.threat_level === "critical").length,
        high: movements.filter((m: { threat_level: string }) => m.threat_level === "high").length,
        source: "db",
      }));
    } catch { /* fall through */ }
  }

  const movements = getCompetitorMovements();
  res.json(successEnvelope("gda-anomaly", "list-movements", {
    movements,
    total: movements.length,
    competitors: [...new Set(movements.map((m) => m.competitor_name))].length,
    critical: movements.filter((m) => m.threat_level === "critical").length,
    high: movements.filter((m) => m.threat_level === "high").length,
    source: "mock",
  }));
});

router.get("/competitor-movements/:id", async (req, res) => {
  const { id } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-competitor-movement", { movement_id: id }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-anomaly", "get-movement", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM competitor_movements WHERE id = $1", [id]);
      if (result.rows.length > 0) {
        const r = result.rows[0];
        return res.json(successEnvelope("gda-anomaly", "get-movement", {
          ...r,
          detected_at: r.detected_at instanceof Date ? r.detected_at.toISOString() : r.detected_at,
          source: "db",
        }));
      }
    } catch { /* fall through */ }
  }

  const movement = getCompetitorMovement(id);
  if (!movement) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "get-movement", {
      code: "NOT_FOUND", message: `Competitor movement ${id} not found`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-anomaly", "get-movement", { ...movement, source: "mock" }));
});

// ---------------------------------------------------------------------------
// J-3: Escalation Rules & Active Escalations
// ---------------------------------------------------------------------------

router.get("/escalation-rules", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-escalation-rules", {}, { timeoutMs: 10_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-anomaly", "list-rules", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM escalation_rules ORDER BY created_at DESC");
      return res.json(successEnvelope("gda-anomaly", "list-rules", {
        rules: result.rows, total: result.rows.length, source: "db",
      }));
    } catch { /* fall through */ }
  }

  const rules = getEscalationRules();
  res.json(successEnvelope("gda-anomaly", "list-rules", { rules, total: rules.length, source: "mock" }));
});

router.get("/escalations", async (_req, res) => {
  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-escalations", {}, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        const escalations = Array.isArray(result.body) ? result.body : (result.body as Record<string, unknown>).escalations ?? [];
        return res.json(successEnvelope("gda-anomaly", "list-escalations", { escalations, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM escalations ORDER BY created_at DESC");
      const escalations = result.rows.map((r) => ({
        ...r,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
        due_at: r.due_at instanceof Date ? r.due_at.toISOString() : r.due_at,
        resolved_at: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : r.resolved_at,
      }));
      const open = escalations.filter((e: { status: string }) => e.status === "open").length;
      const in_progress = escalations.filter((e: { status: string }) => e.status === "in_progress").length;
      const overdue = escalations.filter((e: { status: string }) => e.status === "overdue").length;
      const resolved = escalations.filter((e: { status: string }) => e.status === "resolved").length;
      const critical = escalations.filter((e: { priority: string }) => e.priority === "critical").length;

      return res.json(successEnvelope("gda-anomaly", "list-escalations", {
        escalations, total: escalations.length, open, in_progress, overdue, resolved, critical, source: "db",
      }));
    } catch { /* fall through */ }
  }

  const escalations = getEscalations();
  const open = escalations.filter((e) => e.status === "open").length;
  const in_progress = escalations.filter((e) => e.status === "in_progress").length;
  const overdue = escalations.filter((e) => e.status === "overdue").length;
  const resolved = escalations.filter((e) => e.status === "resolved").length;
  const critical = escalations.filter((e) => e.priority === "critical").length;

  res.json(successEnvelope("gda-anomaly", "list-escalations", {
    escalations, total: escalations.length, open, in_progress, overdue, resolved, critical, source: "mock",
  }));
});

router.get("/escalations/:id", async (req, res) => {
  const { id } = req.params;

  if (n8nWebhookConfigured()) {
    try {
      const result = await callWebhook("gda-escalation", { escalation_id: id }, { timeoutMs: 15_000 });
      if (result.ok && result.body) {
        return res.json(successEnvelope("gda-anomaly", "get-escalation", { ...result.body, source: "n8n" }));
      }
    } catch { /* fall through */ }
  }

  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query("SELECT * FROM escalations WHERE id = $1", [id]);
      if (result.rows.length > 0) {
        const r = result.rows[0];
        return res.json(successEnvelope("gda-anomaly", "get-escalation", {
          ...r,
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          due_at: r.due_at instanceof Date ? r.due_at.toISOString() : r.due_at,
          resolved_at: r.resolved_at instanceof Date ? r.resolved_at.toISOString() : r.resolved_at,
          source: "db",
        }));
      }
    } catch { /* fall through */ }
  }

  const escalation = getEscalation(id);
  if (!escalation) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "get-escalation", {
      code: "NOT_FOUND", message: `Escalation ${id} not found`, detail: null,
    }));
  }
  res.json(successEnvelope("gda-anomaly", "get-escalation", { ...escalation, source: "mock" }));
});

// ---------------------------------------------------------------------------
// POST /api/anomaly/anomalies/:id/acknowledge — real DB write
// ---------------------------------------------------------------------------
router.post("/anomalies/:id/acknowledge", requireRole("admin", "bd_manager", "capture_lead", "analyst"), async (req, res) => {
  const { id } = req.params;
  const pool = getPool();
  const now = new Date().toISOString();

  if (pool) {
    try {
      const current = await pool.query("SELECT id, status FROM anomalies WHERE id = $1", [id]);
      if (current.rows.length === 0) {
        return res.status(404).json(errorEnvelope("gda-anomaly", "acknowledge", {
          code: "NOT_FOUND", message: `Anomaly ${id} not found`, detail: null,
        }));
      }

      await pool.query(
        "UPDATE anomalies SET status = 'acknowledged', acknowledged_at = $1 WHERE id = $2",
        [now, id],
      );

      return res.json(successEnvelope("gda-anomaly", "acknowledge", {
        anomaly_id: id,
        previous_status: current.rows[0].status,
        status: "acknowledged",
        acknowledged_at: now,
      }));
    } catch (err) {
      process.stderr.write(`[anomaly] acknowledge error: ${(err as Error).message}\n`);
      return res.status(500).json(errorEnvelope("gda-anomaly", "acknowledge", {
        code: "DB_ERROR", message: "Failed to acknowledge anomaly", detail: null,
      }));
    }
  }

  // Mock fallback
  const anomaly = getAnomaly(id);
  if (!anomaly) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "acknowledge", {
      code: "NOT_FOUND", message: `Anomaly ${id} not found`, detail: null,
    }));
  }

  res.json(successEnvelope("gda-anomaly", "acknowledge", {
    anomaly_id: id, status: "acknowledged", acknowledged_at: now,
  }, {}, true));
});

// ---------------------------------------------------------------------------
// POST /api/anomaly/anomalies/:id/resolve — real DB write
// ---------------------------------------------------------------------------
router.post("/anomalies/:id/resolve", requireRole("admin", "bd_manager", "capture_lead", "analyst"), async (req, res) => {
  const { id } = req.params;
  const { resolution_notes } = req.body as { resolution_notes?: string };
  const pool = getPool();
  const now = new Date().toISOString();

  if (pool) {
    try {
      const current = await pool.query("SELECT id, status FROM anomalies WHERE id = $1", [id]);
      if (current.rows.length === 0) {
        return res.status(404).json(errorEnvelope("gda-anomaly", "resolve", {
          code: "NOT_FOUND", message: `Anomaly ${id} not found`, detail: null,
        }));
      }

      await pool.query(
        "UPDATE anomalies SET status = 'resolved', resolved_at = $1 WHERE id = $2",
        [now, id],
      );

      return res.json(successEnvelope("gda-anomaly", "resolve", {
        anomaly_id: id,
        previous_status: current.rows[0].status,
        status: "resolved",
        resolved_at: now,
        resolution_notes: resolution_notes ?? null,
      }));
    } catch (err) {
      process.stderr.write(`[anomaly] resolve error: ${(err as Error).message}\n`);
      return res.status(500).json(errorEnvelope("gda-anomaly", "resolve", {
        code: "DB_ERROR", message: "Failed to resolve anomaly", detail: null,
      }));
    }
  }

  // Mock fallback
  const anomaly = getAnomaly(id);
  if (!anomaly) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "resolve", {
      code: "NOT_FOUND", message: `Anomaly ${id} not found`, detail: null,
    }));
  }

  res.json(successEnvelope("gda-anomaly", "resolve", {
    anomaly_id: id, status: "resolved", resolved_at: now,
  }, {}, true));
});

export default router;
