const express = require('express');
const { ok, notConfigured } = require('../lib/envelope');
const { callWebhook, webhookConfig } = require('../lib/n8nClient');
const { READONLY_CHECKS, DRYRUN_CHECKS, allowedDryRunIds, classify, recommend } = require('../lib/checks');

const router = express.Router();

function timeoutMs() {
  const t = parseInt(process.env.QA_CHECK_TIMEOUT_MS || '15000', 10);
  return Number.isFinite(t) && t > 0 ? t : 15000;
}

async function runSet(checks) {
  const rows = [];
  // Sequential keeps load gentle on n8n and aligns with the React QA Center behavior.
  for (const c of checks) {
    const r = await callWebhook(c.path, c.body, { timeoutMs: timeoutMs() });
    const cls = classify(r.http, r.body, r.error);
    rows.push({
      id: c.id,
      label: c.label,
      path: c.path,
      http: r.http,
      ms: r.ms,
      bytes: r.bytes || 0,
      status: cls.status,
      tone: cls.tone,
      error: r.error || null,
    });
  }
  return rows;
}

function summarize(rows) {
  return {
    total: rows.length,
    passed: rows.filter(r => r.status === 'PASS').length,
    failed: rows.filter(r => r.status === 'FAIL' || r.status === 'ERROR' || r.status === 'TIMEOUT').length,
    authFails: rows.filter(r => r.status === 'AUTH FAIL').length,
    empty: rows.filter(r => r.status === 'EMPTY').length,
    notConfigured: rows.filter(r => r.status === 'NOT CONFIGURED').length,
  };
}

router.get('/qa/health', async function (req, res) {
  const wh = webhookConfig();
  if (wh.missing.length > 0) {
    return res.json(notConfigured('GDA.gateway.qa-health', 'health', wh.missing, {
      checks: READONLY_CHECKS.map(c => ({ id: c.id, label: c.label, path: c.path })),
    }));
  }
  const rows = await runSet(READONLY_CHECKS);
  const summary = summarize(rows);
  const overall = summary.failed > 0 || summary.authFails > 0
    ? 'critical'
    : summary.empty > 0 ? 'degraded' : 'operational';
  res.json(ok('GDA.gateway.qa-health', 'health', {
    overall,
    summary,
    rows,
    nextAction: recommend(rows),
  }));
});

router.post('/qa/dry-run', async function (req, res) {
  const wh = webhookConfig();
  if (wh.missing.length > 0) {
    return res.json(notConfigured('GDA.gateway.qa-dry-run', 'dryRun', wh.missing, {
      allowedIds: allowedDryRunIds(),
    }));
  }

  // Optional whitelist filter from caller. If they ask for an id we don't allow, reject — never run arbitrary writes.
  let ids = null;
  if (req.body && Array.isArray(req.body.ids)) {
    const allowed = new Set(allowedDryRunIds());
    const requested = req.body.ids;
    const rejected = requested.filter(id => !allowed.has(id));
    if (rejected.length > 0) {
      return res.status(400).json({
        success: false,
        workflow: 'GDA.gateway.qa-dry-run',
        action: 'dryRun',
        dryRun: true,
        data: null,
        meta: { generatedAt: new Date().toISOString(), source: 'gateway' },
        error: { code: 'NOT_ALLOWED', message: `Only approved dry-run ids are accepted: ${[...allowed].join(', ')}`, retryable: false, rejected },
      });
    }
    ids = new Set(requested);
  }

  const checks = ids ? DRYRUN_CHECKS.filter(c => ids.has(c.id)) : DRYRUN_CHECKS;
  // Defense in depth — re-stamp dryRun:true on every body.
  const safeChecks = checks.map(c => ({ ...c, body: { ...(c.body || {}), dryRun: true } }));
  const rows = await runSet(safeChecks);
  res.json(ok('GDA.gateway.qa-dry-run', 'dryRun', {
    summary: summarize(rows),
    rows,
    nextAction: recommend(rows),
  }, { policy: 'dryRun:true enforced server-side' }, true));
});

module.exports = router;
