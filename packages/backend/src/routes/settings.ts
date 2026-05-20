import { Router } from "express";
import { successEnvelope, errorEnvelope } from "../middleware/envelope";
import { requireRole } from "../lib/auth";
import { webhookConfig, apiConfig, callWebhook } from "../lib/n8n-client";
import { dbConfig, healthCheck as dbHealthCheck } from "../lib/db";
import { getRegistrySummary, WEBHOOK_REGISTRY } from "../lib/webhook-registry";
import type { WebhookStatus } from "../lib/webhook-registry";
import { isLLMAvailable } from "../lib/llm";

const router = Router();

interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  description: string;
}

interface ConnectorStatus {
  name: string;
  configured: boolean;
  missing: string[];
  latencyMs?: number;
  error?: string;
}

/**
 * GET /api/settings
 * Returns system configuration, feature flags, and connector status.
 */
router.get("/", async (_req, res) => {
  const wh = webhookConfig();
  const api = apiConfig();
  const db = dbConfig();

  const webhookAuthConfigured = wh.missing.length === 0 && !!wh.key;

  const connectors: ConnectorStatus[] = [
    {
      name: "n8n Webhooks",
      configured: wh.missing.length === 0,
      missing: wh.missing,
    },
    {
      name: "n8n Webhook Auth",
      configured: webhookAuthConfigured,
      missing: webhookAuthConfigured ? [] : ["GDA_WEBHOOK_KEY"],
    },
    {
      name: "n8n REST API",
      configured: api.missing.length === 0,
      missing: api.missing,
    },
    {
      name: "PostgreSQL",
      configured: db.configured,
      missing: db.missing,
    },
    {
      name: "OpenAI LLM",
      configured: isLLMAvailable(),
      missing: isLLMAvailable() ? [] : ["OPENAI_API_KEY"],
    },
    {
      name: "GovWin IQ",
      configured: !!process.env.GOVWIN_CLIENT_ID && !!process.env.GOVWIN_CLIENT_SECRET &&
                  !!process.env.GOVWIN_USERNAME && !!process.env.GOVWIN_PASSWORD,
      missing: [
        ...(!process.env.GOVWIN_CLIENT_ID ? ["GOVWIN_CLIENT_ID"] : []),
        ...(!process.env.GOVWIN_CLIENT_SECRET ? ["GOVWIN_CLIENT_SECRET"] : []),
        ...(!process.env.GOVWIN_USERNAME ? ["GOVWIN_USERNAME"] : []),
        ...(!process.env.GOVWIN_PASSWORD ? ["GOVWIN_PASSWORD"] : []),
      ],
    },
    {
      name: "GovTribe",
      configured: !!process.env.GOVTRIBE_API_KEY,
      missing: process.env.GOVTRIBE_API_KEY ? [] : ["GOVTRIBE_API_KEY"],
    },
    {
      name: "SAM.gov",
      configured: !!process.env.SAM_API_KEY,
      missing: process.env.SAM_API_KEY ? [] : ["SAM_API_KEY"],
    },
  ];

  // Test DB connectivity if configured
  if (db.configured) {
    const dbStatus = await dbHealthCheck();
    const pgConnector = connectors.find((c) => c.name === "PostgreSQL");
    if (pgConnector) {
      pgConnector.latencyMs = dbStatus.latencyMs;
      if (dbStatus.error) pgConnector.error = dbStatus.error;
    }
  }

  const featureFlags: FeatureFlag[] = [
    {
      key: "QUALIFY_WRITES_ENABLED",
      label: "Qualify Writes",
      enabled: process.env.QUALIFY_WRITES_ENABLED === "true",
      description: "Allow real qualify status changes (not just dry-run previews)",
    },
  ];

  const environment = {
    nodeVersion: process.version,
    uptimeSec: Math.round(process.uptime()),
    pid: process.pid,
    port: process.env.PORT ?? "3001",
    env: process.env.NODE_ENV ?? "development",
  };

  const webhookRegistry = getRegistrySummary();

  res.json(
    successEnvelope("GDA.gateway.settings", "read", {
      connectors,
      featureFlags,
      environment,
      webhookRegistry,
    })
  );
});

/**
 * POST /api/settings/webhook-sync
 * Ping all 42 webhooks and return current status (live/exists/planned).
 * Updates in-memory registry so subsequent requests reflect real state.
 */
router.post("/webhook-sync", requireRole("admin"), async (_req, res) => {
  const wh = webhookConfig();
  if (wh.missing.length > 0) {
    return res.status(503).json(errorEnvelope("GDA.gateway.settings", "webhook-sync", {
      code: "NOT_CONFIGURED",
      message: "N8N_BASE_URL not set — cannot sync webhooks",
      detail: null,
    }));
  }

  const results: Array<{
    path: string;
    previousStatus: WebhookStatus;
    currentStatus: WebhookStatus;
    httpCode: number;
    latencyMs: number;
    changed: boolean;
  }> = [];

  const entries = Object.entries(WEBHOOK_REGISTRY);
  const concurrency = 5;

  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    const promises = batch.map(async ([key, entry]) => {
      const result = await callWebhook(entry.path, {}, { timeoutMs: 8000 });
      const previousStatus = entry.status;
      let currentStatus: WebhookStatus;

      if (result.ok && result.http === 200) {
        currentStatus = "live";
      } else if (result.http >= 400 && result.http < 500) {
        currentStatus = "planned";
      } else if (result.http >= 500) {
        currentStatus = "exists";
      } else if (result.error === "timeout" || result.error === "not_configured") {
        currentStatus = previousStatus;
      } else {
        currentStatus = "planned";
      }

      // Update in-memory registry
      WEBHOOK_REGISTRY[key].status = currentStatus;

      return {
        path: entry.path,
        previousStatus,
        currentStatus,
        httpCode: result.http,
        latencyMs: result.ms,
        changed: previousStatus !== currentStatus,
      };
    });
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  const summary = getRegistrySummary();
  const changed = results.filter((r) => r.changed);

  res.json(successEnvelope("GDA.gateway.settings", "webhook-sync", {
    summary,
    changed: changed.length,
    results,
    timestamp: new Date().toISOString(),
  }));
});

/**
 * GET /api/settings/webhooks
 * Full webhook registry with per-webhook details.
 */
router.get("/webhooks", (_req, res) => {
  const entries = Object.values(WEBHOOK_REGISTRY);
  res.json(successEnvelope("GDA.gateway.settings", "webhooks", entries));
});

export default router;
