// Thin server-side n8n client. Two surfaces:
//   1. callWebhook  — POST to n8n /webhook/<name>, used by /api/qa/health and /api/qa/dry-run.
//   2. listFailedExecutions / fetchWorkflows — n8n REST API, used by /api/failures/latest and registry refresh.
// Secrets read from env at call time, never logged.

const TIMEOUT_DEFAULT = 15000;

async function fetchWithTimeout(url, opts = {}, timeoutMs = TIMEOUT_DEFAULT) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

function webhookConfig() {
  const base = process.env.N8N_BASE_URL || '';
  const key = process.env.GDA_WEBHOOK_KEY || '';
  const missing = [];
  if (!base) missing.push('N8N_BASE_URL');
  // Webhook key is optional in v1 — many proxied paths don't require it from server-to-server.
  return { base: base.replace(/\/$/, ''), key, missing };
}

function apiConfig() {
  const base = process.env.N8N_API_BASE || '';
  const key = process.env.N8N_API_KEY || '';
  const missing = [];
  if (!base) missing.push('N8N_API_BASE');
  if (!key) missing.push('N8N_API_KEY');
  return { base: base.replace(/\/$/, ''), key, missing };
}

async function callWebhook(name, body = {}, opts = {}) {
  const { base, key, missing } = webhookConfig();
  if (missing.length > 0) {
    return { ok: false, http: 0, ms: 0, error: 'not_configured', missing, body: null };
  }
  const url = `${base}/webhook/${encodeURIComponent(name)}`;
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-gda-key'] = key;
  const start = Date.now();
  try {
    const r = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, opts.timeoutMs);
    const text = await r.text().catch(() => '');
    const ms = Date.now() - start;
    let parsed = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = null; }
    }
    return { ok: r.ok, http: r.status, ms, error: null, bodyText: text, body: parsed, bytes: text ? text.length : 0 };
  } catch (e) {
    const ms = Date.now() - start;
    const isTimeout = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return { ok: false, http: 0, ms, error: isTimeout ? 'timeout' : (e.message || 'network_error'), body: null, bytes: 0 };
  }
}

async function listFailedExecutions(limit = 25) {
  const { base, key, missing } = apiConfig();
  if (missing.length > 0) return { configured: false, missing, executions: [] };
  const url = `${base}/executions?status=error&limit=${encodeURIComponent(limit)}`;
  const r = await fetchWithTimeout(url, { headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    return { configured: true, http: r.status, error: text.slice(0, 500), executions: [] };
  }
  const json = await r.json().catch(() => null);
  const data = (json && (json.data || json.executions)) || [];
  return { configured: true, http: r.status, executions: data };
}

async function fetchWorkflows() {
  const { base, key, missing } = apiConfig();
  if (missing.length > 0) return { configured: false, missing, workflows: [] };
  const url = `${base}/workflows?limit=250`;
  const r = await fetchWithTimeout(url, { headers: { 'X-N8N-API-KEY': key, Accept: 'application/json' } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    return { configured: true, http: r.status, error: text.slice(0, 500), workflows: [] };
  }
  const json = await r.json().catch(() => null);
  const data = (json && (json.data || json.workflows)) || [];
  return { configured: true, http: r.status, workflows: data };
}

module.exports = {
  webhookConfig,
  apiConfig,
  callWebhook,
  listFailedExecutions,
  fetchWorkflows,
};
