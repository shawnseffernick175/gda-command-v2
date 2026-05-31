# GDA API Gateway v1

Server-side bridge between the GDA React app and n8n. **No secrets in the React app** — they live here in `.env` only.

This is **Phase 1**: read-only and dry-run endpoints only. It does not perform writes, sends, or paid calls.

## What it gives you

| Endpoint | Method | What it does |
|---|---|---|
| `/health` | GET | Liveness. Reports whether webhook + n8n-API env vars are set. Always 200. |
| `/api/qa/health` | GET | Runs the same read-only checks as the React QA Center, returns one normalized summary. |
| `/api/qa/dry-run` | POST | Runs only approved dry-run checks (`gda-save-opp`, `gda-risk` with `dryRun:true`). Rejects anything else. |
| `/api/workflows/registry` | GET | Returns the workflow registry baseline JSON. Pass `?refresh=true` to fetch live from the n8n REST API (requires `N8N_API_*`). |
| `/api/failures/latest` | GET | Returns the latest failed n8n executions in plain English. Returns `configured:false` (not a crash) if the n8n REST env vars are missing. |

All responses follow the GDA envelope from `gda-n8n-response-standard.md`:
```json
{ "success": true, "workflow": "...", "action": "...", "dryRun": false, "data": ..., "meta": { ... }, "error": null }
```

## Setup — Windows

```powershell
# 1. Install Node 18+ from https://nodejs.org if you don't have it.
node --version          # should say v18 or newer

# 2. Unzip this package, then:
cd gda-api-gateway-v1
npm install
copy .env.example .env  # then edit .env in Notepad — see "Env vars" below

# 3. Verify it works without secrets:
npm run smoke           # all checks should print [PASS] and end with "smoke: OK"

# 4. Start the gateway:
npm start
# It listens on http://localhost:8787
# In another window:
curl http://localhost:8787/health
```

## Setup — VPS (Linux)

```bash
cd /opt
unzip /tmp/gda-api-gateway-v1.zip -d gda-api-gateway-v1
cd gda-api-gateway-v1
npm install
cp .env.example .env
nano .env                   # fill in N8N_BASE_URL etc. — see below
npm run smoke               # confirms unconfigured behavior is healthy
npm start                   # foreground; or use systemd / pm2 / docker for prod
```

## Env vars (`.env`)

All optional in v1. Endpoints that need a missing var return `configured:false` instead of crashing.

| Var | Used by | Notes |
|---|---|---|
| `PORT` | server | Defaults to `8787`. |
| `N8N_BASE_URL` | `/api/qa/health`, `/api/qa/dry-run` | e.g. `https://n8n.csr-llc.tech`. Webhooks called as `<base>/webhook/<name>`. |
| `GDA_WEBHOOK_KEY` | `/api/qa/health`, `/api/qa/dry-run` | Sent as `x-gda-key` header on webhook calls. **Server-side only** — never expose to the browser. |
| `N8N_API_BASE` | `/api/failures/latest`, registry refresh | e.g. `https://n8n.csr-llc.tech/api/v1`. |
| `N8N_API_KEY` | `/api/failures/latest`, registry refresh | n8n personal access token. **Server-side only.** |
| `ALLOWED_ORIGINS` | server | Comma-separated CORS allowlist, e.g. `https://gda.csr-llc.tech`. Empty = same-origin only. |
| `FAILURES_LIMIT` | `/api/failures/latest` | Default record limit (default 25). |
| `QA_CHECK_TIMEOUT_MS` | QA endpoints | Per-check timeout in ms (default 15000). |

## How React talks to it

Once deployed, point React at the gateway via the existing `/api` proxy or directly. The QA Center page can be migrated to call `GET /api/qa/health` and render `data.rows`, `data.summary`, `data.nextAction` — one normalized response instead of eight separate webhook calls.

## Safety rules built in

- Dry-run endpoint **rewrites every request body to set `dryRun: true`** server-side before sending to n8n. Clients cannot opt out.
- Dry-run endpoint **rejects** any `ids[]` member not in the approved list (currently `save-opp-dryrun`, `risk-dryrun`) with HTTP 400.
- The gateway **never logs request bodies** (avoids leaking dry-run inputs).
- The gateway **never returns HTML** — even on error, the envelope is JSON.
- No secrets in any served response.

## Smoke test

`npm run smoke` boots the app on a random port with all env vars unset and verifies:

1. `/health` is 200 and reports both `webhookConfigured:false` and `apiConfigured:false`.
2. `/api/qa/health`, `/api/qa/dry-run`, `/api/failures/latest` return `configured:false` envelopes (not crashes).
3. `/api/workflows/registry` serves the baseline file with no env needed.
4. `/api/qa/dry-run` rejects a non-allowed id with HTTP 400 + `code: NOT_ALLOWED`.
5. Unknown routes return a JSON 404, not an HTML page.

This means the gateway is safe to run for the first time without any credentials configured — it will simply tell you what's missing.

## What's next (Phase 2 — not in v1)

- Move `/api/opportunities/save`, `/api/risks`, `/api/capture-plan/preview`, `/api/deep-research/preview`, `/api/competitors/crawl-preview` behind the gateway with the same dry-run/preview/approval semantics.
- Add a tiny audit log table (any write/dry-run action recorded server-side with caller id).
- Add human-approval token flow for paid/external/send actions.
