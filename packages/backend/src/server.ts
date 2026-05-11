import express from "express";
import cors from "cors";
import authRouter from "./routes/auth";
import { authMiddleware } from "./lib/auth";
import qaRouter from "./routes/qa";
import workflowsRouter from "./routes/workflows";
import opportunitiesRouter from "./routes/opportunities";
import dashboardRouter from "./routes/dashboard";
import doctrineRouter from "./routes/doctrine";
import intelRouter from "./routes/intel";
import captureRouter from "./routes/capture";
import settingsRouter from "./routes/settings";
import financialsRouter from "./routes/financials";
import approvalsRouter from "./routes/approvals";
import complianceRouter from "./routes/compliance";
import proposalsRouter from "./routes/proposals";
import contactsRouter from "./routes/contacts";
import reportsRouter from "./routes/reports";
import enrichmentsRouter from "./routes/enrichments";
import promptsRouter from "./routes/prompts";
import fastTrackRouter from "./routes/fast-track";
import knowledgeRouter from "./routes/knowledge";
import rfpShredderRouter from "./routes/rfp-shredder";
import predictiveRouter from "./routes/predictive";
import colorReviewRouter from "./routes/color-review";
import anomalyRouter from "./routes/anomaly";
import samMonitorRouter from "./routes/sam-monitor";
import discussionsRouter from "./routes/discussions";
import cparsRouter from "./routes/cpars";
import fpdsRouter from "./routes/fpds";
import ingestRouter from "./routes/ingest";
import backupRouter from "./routes/backup";
import adminRouter from "./routes/admin";
import filesRouter from "./routes/files";
import feedsRouter from "./routes/feeds";
import { successEnvelope } from "./middleware/envelope";
import { webhookConfig, apiConfig } from "./lib/n8n-client";
import { dbConfig, healthCheck as dbHealthCheck } from "./lib/db";
import { WEBHOOK_REGISTRY, getRegistrySummary } from "./lib/webhook-registry";
import { isLLMAvailable } from "./lib/llm";
import { requestLogger, log } from "./lib/logger";
import { ensureUploadDir } from "./lib/storage";
import { startScheduledSync, stopScheduledSync } from "./lib/feed-sync";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "256kb" }));

// Ensure upload directory exists
ensureUploadDir();

// Structured JSON request logging with correlation IDs
app.use(requestLogger);

// --- Gateway health ---
app.get("/health", async (_req, res) => {
  const wh = webhookConfig();
  const api = apiConfig();
  const db = dbConfig();
  let dbStatus: { ok: boolean; latencyMs: number; error?: string } | null = null;
  if (db.configured) {
    dbStatus = await dbHealthCheck();
  }
  res.json(
    successEnvelope("GDA.gateway", "health", {
      status: "ok",
      uptimeSec: Math.round(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version,
      config: {
        webhookConfigured: wh.missing.length === 0,
        apiConfigured: api.missing.length === 0,
        dbConfigured: db.configured,
        missingForWebhook: wh.missing,
        missingForApi: api.missing,
        missingForDb: db.missing,
      },
      db: dbStatus,
    })
  );
});

// --- Auth routes (no auth middleware) ---
app.use("/api/auth", authRouter);

// --- Ingest routes (key-based auth, no JWT) ---
app.use("/api/ingest", ingestRouter);

// --- Webhook registry (public, read-only) ---
app.get("/api/webhooks/registry", (_req, res) => {
  res.json(successEnvelope("gda-webhooks", "registry", {
    ...getRegistrySummary(),
    webhooks: WEBHOOK_REGISTRY,
  }));
});

// --- Auth middleware for all other API routes ---
app.use("/api", authMiddleware);

// --- API routes ---
app.use("/api/qa", qaRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/opportunities", opportunitiesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/doctrine", doctrineRouter);
app.use("/api/intel", intelRouter);
app.use("/api/capture", captureRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/financials", financialsRouter);
app.use("/api/approvals", approvalsRouter);
app.use("/api/compliance", complianceRouter);
app.use("/api/proposals", proposalsRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/enrichments", enrichmentsRouter);
app.use("/api/prompts", promptsRouter);
app.use("/api/fast-track", fastTrackRouter);
app.use("/api/knowledge", knowledgeRouter);
app.use("/api/rfp-shredder", rfpShredderRouter);
app.use("/api/predictive", predictiveRouter);
app.use("/api/color-review", colorReviewRouter);
app.use("/api/anomaly", anomalyRouter);
app.use("/api/sam-monitor", samMonitorRouter);
app.use("/api/discussions", discussionsRouter);
app.use("/api/cpars", cparsRouter);
app.use("/api/fpds", fpdsRouter);
app.use("/api/backup", backupRouter);
app.use("/api/admin", adminRouter);
app.use("/api/files", filesRouter);
app.use("/api/feeds", feedsRouter);

// --- Frontend error reporting endpoint ---
app.post("/api/errors", (req, res) => {
  const { message, stack, componentStack, url, timestamp } = req.body ?? {};
  log.error("client_error", {
    clientMessage: typeof message === "string" ? message.slice(0, 500) : "Unknown",
    clientStack: typeof stack === "string" ? stack.slice(0, 2000) : undefined,
    componentStack: typeof componentStack === "string" ? componentStack.slice(0, 1000) : undefined,
    clientUrl: typeof url === "string" ? url.slice(0, 500) : undefined,
    clientTimestamp: timestamp,
    correlationId: req.headers["x-correlation-id"] as string,
  });
  res.json({ received: true });
});

// --- Detailed health endpoint ---
app.get("/health/detailed", async (_req, res) => {
  const wh = webhookConfig();
  const api = apiConfig();
  const db = dbConfig();
  let dbStatus: { ok: boolean; latencyMs: number; error?: string } | null = null;
  if (db.configured) {
    dbStatus = await dbHealthCheck();
  }

  const memUsage = process.memoryUsage();

  const components = [
    {
      name: "postgresql",
      status: !db.configured ? "not_configured" : dbStatus?.ok ? "healthy" : "unhealthy",
      latencyMs: dbStatus?.latencyMs ?? null,
      error: dbStatus?.error ?? null,
    },
    {
      name: "n8n_webhooks",
      status: wh.missing.length === 0 ? "configured" : "not_configured",
      missing: wh.missing,
    },
    {
      name: "n8n_api",
      status: api.missing.length === 0 ? "configured" : "not_configured",
      missing: api.missing,
    },
    {
      name: "openai_llm",
      status: isLLMAvailable() ? "configured" : "not_configured",
    },
  ];

  const allHealthy = components.every((c) => c.status !== "unhealthy");

  res.json(
    successEnvelope("GDA.gateway", "health-detailed", {
      status: allHealthy ? "ok" : "degraded",
      uptimeSec: Math.round(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version,
      memory: {
        rss: Math.round(memUsage.rss / 1_048_576),
        heapUsed: Math.round(memUsage.heapUsed / 1_048_576),
        heapTotal: Math.round(memUsage.heapTotal / 1_048_576),
        external: Math.round(memUsage.external / 1_048_576),
      },
      components,
      timestamp: new Date().toISOString(),
    }),
  );
});

// --- Catch-all 404 ---
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    workflow: "GDA.gateway",
    action: "not-found",
    dryRun: false,
    data: null,
    meta: { generatedAt: new Date().toISOString(), source: "gateway" },
    error: {
      code: "NOT_FOUND",
      message: `Route not found: ${_req.method} ${_req.originalUrl}`,
      detail: null,
    },
  });
});

// Last-resort error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("unhandled_error", { error: err.message, stack: err.stack?.slice(0, 2000) });
  res.status(500).json({
    success: false,
    workflow: "GDA.gateway",
    action: "error",
    dryRun: false,
    data: null,
    meta: { generatedAt: new Date().toISOString(), source: "gateway" },
    error: {
      code: "INTERNAL",
      message: err.message ? err.message.slice(0, 300) : "Internal error",
      detail: null,
    },
  });
});

const server = app.listen(PORT, () => {
  log.info("server_started", { port: Number(PORT), env: process.env.NODE_ENV ?? "development" });

  // Start scheduled feed sync if configured
  const syncInterval = parseInt(process.env.FEED_SYNC_INTERVAL_HOURS ?? "6", 10);
  if (syncInterval > 0) {
    startScheduledSync(syncInterval);
  }
});

// Graceful shutdown
function shutdown(signal: string) {
  log.info("shutdown_initiated", { signal });
  stopScheduledSync();
  server.close(() => {
    log.info("server_closed");
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    log.error("forced_shutdown", { reason: "timeout" });
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
