# F-029 Wave 1 Execution Record

**Date:** 2026-05-26T07:11–07:22 UTC
**Operator:** Devin (session 4e5911da)
**SSH:** root@100.100.80.78 (Tailscale)

## R-Item Outcomes

| R-Item | Description | Outcome | Notes |
|--------|-------------|---------|-------|
| R-3.1 | Delete GDA GitHub Bridge PAT (`TBzQR4MBiWOGoJmV`) | **SKIPPED** | 0 workflow refs, but F-035 (hardcoded-token refactor) has NOT shipped. Blocked on F-035. |
| R-3.2 | Delete GDA GitHub Bridge Webhook Secret (`8fS9ihGIWT6gUpio`) | **DONE** | 0 workflow refs → deleted |
| R-3.3 | Delete gda Google Gemini E2E Test (`IbQJuYuO5D9w9Af4`) | **DONE** | 0 workflow refs → deleted |
| R-3.4 | Delete QA Webhook Auth (`3pU3F6Su9mpJ9nei`) | **DONE** | 0 workflow refs → deleted |
| R-4 | Remove FIRECRAWL_API_KEY from n8n .env | **DONE** | 0 workflow refs. Removed, n8n restarted, healthz 200 |
| R-5 | Remove Pinecone vars + credential | **BLOCKED** | 3 active workflows use Pinecone: `ai-agent-upload`, `doc-ingest`, `sitrep 2` |
| R-10 | Audit Gist PAT scope | **DONE** | Report: `docs/audit/f029-r10-gist-pat-audit.md` |
| R-11 | Investigate Postgres account cred | **DONE** | Report: `docs/audit/f029-r11-postgres-account-audit.md` |
| R-12 | Investigate Redis account cred | **DONE** | Report: `docs/audit/f029-r12-redis-account-audit.md` |

## Credential Count

| Metric | Before | After |
|--------|--------|-------|
| n8n credentials | 17 | 14 |
| Deleted | — | 3 (R-3.2, R-3.3, R-3.4) |
| Skipped | — | 1 (R-3.1 blocked on F-035) |

## n8n .env Variable Count

| Metric | Before | After |
|--------|--------|-------|
| Total variables | 31 | 30 |
| Removed | — | FIRECRAWL_API_KEY |
| Not removed | — | PINECONE_API_KEY, PINECONE_HOST (R-5 blocked) |

## Canary Verification

| Workflow | Pre-change (last) | Post-change (first post-restart) | Status |
|----------|-------------------|----------------------------------|--------|
| GDA.cron.system-watchdog | id:118992 07:10:57 success | id:118997 07:20:57 success | OK |
| GDA.cron.change-detector | id:118991 07:10:15 success | id:118994 07:15:15 success | OK |

n8n restarted at ~07:12 UTC. Both canaries ran and succeeded post-restart.

## Sentinel Snapshot

| Component | Before | After | Change |
|-----------|--------|-------|--------|
| overall_status | degraded | degraded | no change |
| postgres | healthy | healthy | — |
| n8n_canary | healthy | healthy | — |
| amendment_monitor | healthy | healthy | — |
| writers_24h | degraded (2.4%) | degraded (2.4%) | — |
| sam_api | healthy | healthy | — |
| embeddings | healthy | healthy | — |
| disk | healthy (28%) | healthy (28%) | — |
| source_health | degraded | degraded | — |

**Sentinel status NOT WORSE than pre-change.** ✓

## n8n Health

- `/healthz` → HTTP 200 (`{"status":"ok"}`) post-restart
- `gda-backend` → HTTP 200 on `/api/sentinel/current` (unchanged)

## Env Diff (names only — no values)

```diff
 # /root/n8n-envision/.env
 ANTHROPIC_API_KEY
 DB_POSTGRESDB_DATABASE
 DB_POSTGRESDB_HOST
 DB_POSTGRESDB_PASSWORD
 DB_POSTGRESDB_PORT
 DB_POSTGRESDB_USER
 DB_TYPE
 EXECUTIONS_DATA_MAX_AGE
 EXECUTIONS_DATA_PRUNE
 EXECUTIONS_DATA_SAVE_ON_SUCCESS
 EXECUTIONS_MODE
 EXECUTIONS_PROCESS
-FIRECRAWL_API_KEY
 GENERIC_TIMEZONE
 N8N_ALLOW_EXEC_COMMAND
 N8N_API_KEY
 N8N_BLOCK_ENV_ACCESS_IN_NODE
 N8N_COMMUNITY_PACKAGES_ENABLED
 N8N_ENCRYPTION_KEY
 NODES_EXCLUDE
 OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS
 OPENAI_API_KEY
 PINECONE_API_KEY
 PINECONE_HOST
 POSTGRES_DB
 POSTGRES_PASSWORD
 POSTGRES_USER
 QUEUE_BULL_REDIS_HOST
 QUEUE_BULL_REDIS_PORT
 SAM_GOV_API_KEY
 TAVILY_API_KEY
```
