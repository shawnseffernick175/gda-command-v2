# Connector Env-Var Wiring Runbook

> **Introduced by:** F-321 (#587) — docker-compose.prod.yml drift fix
> **Last updated:** 2026-06-01

## Background

Docker Compose does **not** pass host env vars into containers automatically.
Every variable the container code reads via `process.env.*` (Node) or
`os.getenv()` (Python) must be explicitly listed in the service's
`environment:` block in `docker-compose.prod.yml`.

If a connector PR adds new `process.env.FOOBAR_*` reads but does not update
the compose file, the container will see `undefined` at runtime — a silent
failure.

## Checklist: Adding a New Connector

1. **Add env reads in connector code** — e.g. `process.env['NEWCONN_API_KEY']`
   in `apps/backend-v3/src/` or `os.getenv('NEWCONN_API_KEY')` in
   `apps/gda-agent-v3/src/`.

2. **Add `${VAR:-}` passthrough lines in `docker-compose.prod.yml`** for
   **both** `backend-v3` and `gda-agent-v3` services:

   ```yaml
   # --- NewConn connector ---
   NEWCONN_API_KEY: ${NEWCONN_API_KEY:-}
   ```

   Use `${VAR:-default}` when a sensible default exists;
   use `${VAR:-}` (empty default) for secrets and credentials.

3. **Add keys to `.env.production.example`** — document what each var does
   and whether it is required or optional.

4. **Update the compose hash file** — CI enforces hash parity:

   ```bash
   sha256sum docker-compose.prod.yml | awk '{print $2, $1}' \
     > .github/expected-compose-hashes.txt
   ```

5. **CI enforces env-var parity** — the `Compose Drift Check` job in
   `.github/workflows/ci.yml` scans `apps/backend-v3/src/` and
   `apps/gda-agent-v3/src/` for `process.env.GOVTRIBE_*`, `GOVWIN_*`, and
   `ENABLE_GOVTRIBE_*` reads, then verifies each name appears in
   `docker-compose.prod.yml`. To extend coverage to a new connector prefix,
   update the grep pattern in the "Verify connector env-var parity" step.

## Current Connector Env Vars

### GovTribe (PRs #557, #565)

| Variable | Default | Where Read |
|---|---|---|
| `GOVTRIBE_API_KEY` | *(empty)* | `apps/backend-v3/src/ingest/govtribe/client.ts` |
| `GOVTRIBE_API_BASE` | `https://api.govtribe.com/v1` | `apps/backend-v3/src/ingest/govtribe/client.ts` |
| `GOVTRIBE_CYCLE_CREDIT_CAP` | `150` | `apps/backend-v3/src/ingest/govtribe/client.ts` |
| `GOVTRIBE_MONTHLY_CREDIT_CAP` | `1200` | `apps/backend-v3/src/ingest/govtribe/client.ts` |
| `ENABLE_GOVTRIBE_INGEST` | enabled unless `'false'` | `apps/backend-v3/src/cron/index.ts` |
| `GOVTRIBE_MCP_URL` | `https://govtribe.com/mcp` | `apps/backend-v3/src/ingest/govtribe/mcp_client.ts` (F-323) |

### GovWin IQ — CAS Auth (PR #561)

| Variable | Default | Where Read |
|---|---|---|
| `GOVWIN_USERNAME` | *(required)* | `apps/backend-v3/src/services/govwin/auth.ts` |
| `GOVWIN_PASSWORD` | *(required)* | `apps/backend-v3/src/services/govwin/auth.ts` |
| `GOVWIN_CONNECTOR_V1` | `'false'` (feature flag) | `apps/backend-v3/src/cron/index.ts`, `apps/backend-v3/src/app.ts` |

> **Note:** GovWin uses Apereo CAS (username + password), **not** OAuth2
> client-credentials. There is no `GOVWIN_CLIENT_ID` / `GOVWIN_CLIENT_SECRET`.
