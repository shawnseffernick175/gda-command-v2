const express = require('express');
const fs = require('fs');
const path = require('path');
const { ok, fail } = require('../lib/envelope');
const { fetchWorkflows, apiConfig } = require('../lib/n8nClient');

const router = express.Router();

const BASELINE_PATH = path.join(__dirname, '..', '..', 'data', 'workflow-registry-baseline.json');

function loadBaseline() {
  try {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

router.get('/workflows/registry', async function (req, res) {
  const wantLive = String(req.query.refresh || '').toLowerCase() === 'true';
  const cfg = apiConfig();

  if (wantLive && cfg.missing.length === 0) {
    const live = await fetchWorkflows();
    if (live.configured && Array.isArray(live.workflows)) {
      const summary = summarizeLive(live.workflows);
      return res.json(ok('GDA.gateway.workflows-registry', 'list', {
        source: 'n8n-live',
        summary,
        workflows: live.workflows.map(simplifyLive),
      }, { count: live.workflows.length }));
    }
    if (live.error) {
      return res.json(fail('GDA.gateway.workflows-registry', 'list',
        { code: 'UPSTREAM_ERROR', message: 'n8n REST API returned an error', retryable: true, http: live.http }));
    }
  }

  const baseline = loadBaseline();
  if (!baseline) {
    return res.json(fail('GDA.gateway.workflows-registry', 'list',
      { code: 'NO_BASELINE', message: 'No registry baseline file present and no live n8n config available.', retryable: false }));
  }
  return res.json(ok('GDA.gateway.workflows-registry', 'list', {
    source: 'baseline-file',
    summary: baseline.summary || null,
    generatedAt: baseline.generatedAt || null,
    workflows: baseline.workflows || [],
  }, { count: (baseline.workflows || []).length, configuredForLive: cfg.missing.length === 0, hint: cfg.missing.length === 0 ? 'Pass ?refresh=true to fetch from n8n.' : 'Set N8N_API_BASE and N8N_API_KEY to enable live refresh.' }));
});

function simplifyLive(w) {
  return {
    id: w.id,
    name: w.name,
    active: !!w.active,
    nodeCount: Array.isArray(w.nodes) ? w.nodes.length : (w.nodeCount ?? null),
    updatedAt: w.updatedAt || null,
  };
}

function summarizeLive(workflows) {
  return {
    total: workflows.length,
    active: workflows.filter(w => w.active).length,
  };
}

module.exports = router;
