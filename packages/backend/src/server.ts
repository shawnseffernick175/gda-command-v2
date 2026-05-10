import express from "express";
import cors from "cors";
import qaRouter from "./routes/qa";
import workflowsRouter from "./routes/workflows";
import opportunitiesRouter from "./routes/opportunities";
import dashboardRouter from "./routes/dashboard";
import doctrineRouter from "./routes/doctrine";
import intelRouter from "./routes/intel";
import captureRouter from "./routes/capture";
import settingsRouter from "./routes/settings";
import { successEnvelope } from "./middleware/envelope";
import { webhookConfig, apiConfig } from "./lib/n8n-client";
import { dbConfig, healthCheck as dbHealthCheck } from "./lib/db";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "256kb" }));

// Structured request log
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    process.stdout.write(`[gateway] ${req.method} ${req.path} ${res.statusCode} ${ms}ms\n`);
  });
  next();
});

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

// --- API routes ---
app.use("/api/qa", qaRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/opportunities", opportunitiesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/doctrine", doctrineRouter);
app.use("/api/intel", intelRouter);
app.use("/api/capture", captureRouter);
app.use("/api/settings", settingsRouter);

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
  process.stderr.write(`[gateway] error: ${err.message}\n`);
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

app.listen(PORT, () => {
  process.stdout.write(`[GDA Gateway v2] listening on http://localhost:${PORT}\n`);
});

export default app;
