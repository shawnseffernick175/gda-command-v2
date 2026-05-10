import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
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
    anomalies,
    total: anomalies.length,
    active,
    acknowledged,
    resolved,
    dismissed,
    critical,
    high,
    source: "mock",
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

  const anomaly = getAnomaly(id);
  if (!anomaly) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "get-anomaly", {
      code: "NOT_FOUND",
      message: `Anomaly ${id} not found`,
      detail: null,
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

  const movement = getCompetitorMovement(id);
  if (!movement) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "get-movement", {
      code: "NOT_FOUND",
      message: `Competitor movement ${id} not found`,
      detail: null,
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

  const rules = getEscalationRules();
  res.json(successEnvelope("gda-anomaly", "list-rules", {
    rules,
    total: rules.length,
    source: "mock",
  }));
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

  const escalations = getEscalations();
  const open = escalations.filter((e) => e.status === "open").length;
  const in_progress = escalations.filter((e) => e.status === "in_progress").length;
  const overdue = escalations.filter((e) => e.status === "overdue").length;
  const resolved = escalations.filter((e) => e.status === "resolved").length;
  const critical = escalations.filter((e) => e.priority === "critical").length;

  res.json(successEnvelope("gda-anomaly", "list-escalations", {
    escalations,
    total: escalations.length,
    open,
    in_progress,
    overdue,
    resolved,
    critical,
    source: "mock",
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

  const escalation = getEscalation(id);
  if (!escalation) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "get-escalation", {
      code: "NOT_FOUND",
      message: `Escalation ${id} not found`,
      detail: null,
    }));
  }
  res.json(successEnvelope("gda-anomaly", "get-escalation", { ...escalation, source: "mock" }));
});

// ---------------------------------------------------------------------------
// Acknowledge / Resolve / Dismiss anomaly (dry-run)
// ---------------------------------------------------------------------------

router.post("/anomalies/:id/acknowledge", async (req, res) => {
  const { id } = req.params;
  const anomaly = getAnomaly(id);
  if (!anomaly) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "acknowledge", {
      code: "NOT_FOUND",
      message: `Anomaly ${id} not found`,
      detail: null,
    }));
  }

  res.json({
    success: true,
    workflow: "gda-anomaly",
    action: "acknowledge",
    dryRun: true,
    data: {
      anomaly_id: id,
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      message: `Anomaly ${id} would be acknowledged (dry-run). Connect to n8n workflow GDA.api.health-scan for live updates.`,
    },
    meta: { generatedAt: new Date().toISOString(), source: "mock" },
    error: null,
  });
});

router.post("/anomalies/:id/resolve", async (req, res) => {
  const { id } = req.params;
  const anomaly = getAnomaly(id);
  if (!anomaly) {
    return res.status(404).json(errorEnvelope("gda-anomaly", "resolve", {
      code: "NOT_FOUND",
      message: `Anomaly ${id} not found`,
      detail: null,
    }));
  }

  res.json({
    success: true,
    workflow: "gda-anomaly",
    action: "resolve",
    dryRun: true,
    data: {
      anomaly_id: id,
      status: "resolved",
      resolved_at: new Date().toISOString(),
      message: `Anomaly ${id} would be resolved (dry-run). Connect to n8n workflow GDA.api.health-scan for live updates.`,
    },
    meta: { generatedAt: new Date().toISOString(), source: "mock" },
    error: null,
  });
});

export default router;
