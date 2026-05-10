const express = require('express');
const { ok } = require('../lib/envelope');
const { webhookConfig, apiConfig } = require('../lib/n8nClient');

const router = express.Router();

// Liveness probe — does NOT call upstream. Always 200 if the process is up.
router.get('/health', function (req, res) {
  const wh = webhookConfig();
  const api = apiConfig();
  res.json(ok('GDA.gateway', 'health', {
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    pid: process.pid,
    nodeVersion: process.version,
    config: {
      webhookConfigured: wh.missing.length === 0,
      apiConfigured: api.missing.length === 0,
      missingForWebhook: wh.missing,
      missingForApi: api.missing,
    },
  }));
});

module.exports = router;
