/**
 * Server-side n8n client. Two surfaces:
 *   1. callWebhook  — POST to n8n /webhook/<name>, used by /api/qa/health and /api/qa/dry-run.
 *   2. listFailedExecutions / fetchWorkflows — n8n REST API, used by /api/qa/latest-failures and registry.
 * Secrets read from env at call time, never logged.
 */

const TIMEOUT_DEFAULT = 60_000;

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = TIMEOUT_DEFAULT
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

export interface ConfigResult {
  base: string;
  key: string;
  missing: string[];
}

export function webhookConfig(): ConfigResult {
  const base = process.env.N8N_BASE_URL ?? "";
  const key = process.env.GDA_WEBHOOK_KEY ?? "";
  const missing: string[] = [];
  if (!base) missing.push("N8N_BASE_URL");
  return { base: base.replace(/\/$/, ""), key, missing };
}

export function apiConfig(): ConfigResult {
  const base = process.env.N8N_API_BASE ?? "";
  const key = process.env.N8N_API_KEY ?? "";
  const missing: string[] = [];
  if (!base) missing.push("N8N_API_BASE");
  if (!key) missing.push("N8N_API_KEY");
  return { base: base.replace(/\/$/, ""), key, missing };
}

export interface WebhookResult {
  ok: boolean;
  http: number;
  ms: number;
  error: string | null;
  missing?: string[];
  body: unknown;
  bytes: number;
}

export async function callWebhook(
  name: string,
  body: Record<string, unknown> = {},
  opts: { timeoutMs?: number } = {}
): Promise<WebhookResult> {
  const { base, key, missing } = webhookConfig();
  if (missing.length > 0) {
    return { ok: false, http: 0, ms: 0, error: "not_configured", missing, body: null, bytes: 0 };
  }
  const url = `${base}/webhook/${encodeURIComponent(name)}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["x-gda-key"] = key;
  const start = Date.now();
  try {
    const r = await fetchWithTimeout(
      url,
      { method: "POST", headers, body: JSON.stringify(body) },
      opts.timeoutMs
    );
    const text = await r.text().catch(() => "");
    const ms = Date.now() - start;
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = null; }
    }
    return { ok: r.ok, http: r.status, ms, error: null, body: parsed, bytes: text.length };
  } catch (e: unknown) {
    const ms = Date.now() - start;
    const err = e as Error;
    const isTimeout = err.name === "AbortError" || err.name === "TimeoutError";
    return {
      ok: false,
      http: 0,
      ms,
      error: isTimeout ? "timeout" : (err.message || "network_error"),
      body: null,
      bytes: 0,
    };
  }
}

export interface FailedExecutionsResult {
  configured: boolean;
  http?: number;
  error?: string;
  missing?: string[];
  executions: unknown[];
}

export async function listFailedExecutions(limit = 25): Promise<FailedExecutionsResult> {
  const { base, key, missing } = apiConfig();
  if (missing.length > 0) {
    return { configured: false, missing, executions: [] };
  }
  const url = `${base}/executions?status=error&limit=${encodeURIComponent(limit)}&includeData=true`;
  try {
    const r = await fetchWithTimeout(url, {
      headers: { "X-N8N-API-KEY": key, Accept: "application/json" },
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { configured: true, http: r.status, error: text.slice(0, 500), executions: [] };
    }
    const json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    const data = (json && ((json.data as unknown[]) || (json.executions as unknown[]))) || [];

    // Enrich with workflow names from /workflows endpoint
    try {
      const wfResult = await fetchWorkflows(250);
      if (wfResult.configured && wfResult.workflows.length > 0) {
        const nameMap = new Map<string, string>();
        for (const wf of wfResult.workflows) {
          const w = wf as Record<string, unknown>;
          if (w.id && w.name) nameMap.set(String(w.id), String(w.name));
        }
        for (const exec of data) {
          const e = exec as Record<string, unknown>;
          const wfId = String(e.workflowId ?? "");
          if (wfId && nameMap.has(wfId)) {
            e.workflowName = nameMap.get(wfId);
          }
        }
      }
    } catch { /* ignore enrichment failures */ }

    return { configured: true, http: r.status, executions: data };
  } catch (e: unknown) {
    const err = e as Error;
    return { configured: true, error: err.message, executions: [] };
  }
}

export interface WorkflowsResult {
  configured: boolean;
  http?: number;
  error?: string;
  missing?: string[];
  workflows: unknown[];
}

export async function fetchWorkflows(limit = 250): Promise<WorkflowsResult> {
  const { base, key, missing } = apiConfig();
  if (missing.length > 0) {
    return { configured: false, missing, workflows: [] };
  }
  const url = `${base}/workflows?limit=${limit}`;
  try {
    const r = await fetchWithTimeout(url, {
      headers: { "X-N8N-API-KEY": key, Accept: "application/json" },
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { configured: true, http: r.status, error: text.slice(0, 500), workflows: [] };
    }
    const json = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    const data = (json && ((json.data as unknown[]) || (json.workflows as unknown[]))) || [];
    return { configured: true, http: r.status, workflows: data };
  } catch (e: unknown) {
    const err = e as Error;
    return { configured: true, error: err.message, workflows: [] };
  }
}
