const express = require('express');
const { ok, notConfigured, fail } = require('../lib/envelope');
const { listFailedExecutions, apiConfig } = require('../lib/n8nClient');

const router = express.Router();

function plainEnglish(exec) {
  // n8n execution shape varies by version; pull what we need defensively.
  const wfName = exec.workflowData?.name || exec.workflowName || exec.workflow?.name || exec.workflowId || 'unknown workflow';
  const startedAt = exec.startedAt || exec.createdAt || null;
  const stoppedAt = exec.stoppedAt || exec.finishedAt || null;
  const errNode = exec.data?.resultData?.lastNodeExecuted || exec.lastNodeExecuted || null;
  const errMsg =
    exec.data?.resultData?.error?.message ||
    exec.error?.message ||
    exec.message ||
    'No message returned by n8n';
  return {
    id: exec.id || null,
    workflowName: wfName,
    workflowId: exec.workflowId || exec.workflowData?.id || null,
    failedNode: errNode,
    message: typeof errMsg === 'string' ? errMsg.slice(0, 500) : 'See execution detail',
    startedAt,
    stoppedAt,
  };
}

router.get('/failures/latest', async function (req, res) {
  const cfg = apiConfig();
  if (cfg.missing.length > 0) {
    return res.json(notConfigured('GDA.gateway.failures-latest', 'list', cfg.missing, {
      hint: 'Set N8N_API_BASE and N8N_API_KEY in .env to fetch failed executions from n8n.',
    }));
  }
  const limitRaw = parseInt(req.query.limit || process.env.FAILURES_LIMIT || '25', 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 250 ? limitRaw : 25;
  const out = await listFailedExecutions(limit);
  if (!out.configured) {
    return res.json(notConfigured('GDA.gateway.failures-latest', 'list', out.missing || cfg.missing));
  }
  if (out.error) {
    return res.json(fail('GDA.gateway.failures-latest', 'list',
      { code: 'UPSTREAM_ERROR', message: 'n8n REST API returned an error', retryable: true, http: out.http }));
  }
  const rows = (out.executions || []).map(plainEnglish);
  return res.json(ok('GDA.gateway.failures-latest', 'list', { rows }, { count: rows.length, limit }));
});

module.exports = router;
