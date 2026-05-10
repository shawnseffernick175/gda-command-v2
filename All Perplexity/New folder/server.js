// GDA API Gateway v1 — Phase 1 (read-only + dry-run only).
// Owns secrets server-side. React must never see N8N_API_KEY or GDA_WEBHOOK_KEY.
// Endpoints:
//   GET  /health
//   GET  /api/qa/health
//   POST /api/qa/dry-run
//   GET  /api/workflows/registry
//   GET  /api/failures/latest

const express = require('express');
const fs = require('fs');
const path = require('path');

// Best-effort dotenv loader (no extra dep). Reads .env if present.
(function loadDotEnv() {
  try {
    const p = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(p)) return;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) { /* ignore */ }
})();

const healthRoute = require('./routes/health');
const qaRoute = require('./routes/qa');
const workflowsRoute = require('./routes/workflows');
const failuresRoute = require('./routes/failures');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// Tiny CORS: only origins from ALLOWED_ORIGINS env are echoed. Same-origin requires no header.
app.use(function (req, res, next) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Structured request log — never logs req body to avoid leaking dry-run payloads in prod.
app.use(function (req, res, next) {
  const start = Date.now();
  res.on('finish', function () {
    const ms = Date.now() - start;
    process.stdout.write(`[gateway] ${req.method} ${req.path} ${res.statusCode} ${ms}ms\n`);
  });
  next();
});

app.use('/', healthRoute);
app.use('/api', qaRoute);
app.use('/api', workflowsRoute);
app.use('/api', failuresRoute);

app.use(function (req, res) {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
});

// Last-resort error handler so a crashing route never returns HTML.
app.use(function (err, req, res, next) {
  process.stderr.write(`[gateway] error: ${err && err.message}\n`);
  res.status(500).json({ success: false, error: { code: 'INTERNAL', message: err && err.message ? err.message.slice(0, 300) : 'Internal error', retryable: false } });
});

const PORT = parseInt(process.env.PORT || '8787', 10);
if (require.main === module) {
  app.listen(PORT, function () {
    process.stdout.write(`[gateway] GDA API Gateway v1 listening on :${PORT}\n`);
  });
}

module.exports = app;
