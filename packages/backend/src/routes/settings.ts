import { Router } from "express";
import { successEnvelope } from "../middleware/envelope";
import { webhookConfig, apiConfig } from "../lib/n8n-client";
import { dbConfig, healthCheck as dbHealthCheck } from "../lib/db";
import { getRegistrySummary } from "../lib/webhook-registry";
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

export default router;
