# F-037: Docker Compose Drift Reconciliation

**Issue:** #293
**Date:** 2026-05-26
**PR:** #335

## Background

The n8n docker-compose file on the VPS (`/root/n8n-envision/docker-compose.yml`)
accumulated manual edits during F-035 Waves 1–4 (env var pass-throughs for
migrated secrets). This file was never tracked in the repo, meaning auto-deploy
could not detect or prevent drift.

## Drift Diagnosis

**Finding:** The VPS compose file was not tracked in the repo at all. There was
no repo-side copy to drift _from_ — the entire file was untracked.

### VPS Compose Structure (docker-compose.n8n.yml)

| Section | Details |
|---------|---------|
| **Volumes** | `db_storage`, `n8n_storage`, `redis_storage`, `shared_files` |
| **Services** | `postgres` (pgvector:pg16), `redis` (redis:6-alpine), `n8n` (docker.n8n.io/n8nio/n8n) |
| **Networks** | `envision-internal` (internal), `n8n_default` (external) |

### N8n Service Environment Variables (names only)

| Category | Variables |
|----------|-----------|
| **Database** | DB_TYPE, DB_POSTGRESDB_HOST, DB_POSTGRESDB_PORT, DB_POSTGRESDB_DATABASE, DB_POSTGRESDB_USER, DB_POSTGRESDB_PASSWORD |
| **Encryption** | N8N_ENCRYPTION_KEY |
| **Execution** | EXECUTIONS_MODE, EXECUTIONS_PROCESS, EXECUTIONS_DATA_PRUNE, EXECUTIONS_DATA_MAX_AGE, EXECUTIONS_DATA_SAVE_ON_SUCCESS |
| **Redis/Queue** | QUEUE_BULL_REDIS_HOST, QUEUE_BULL_REDIS_PORT |
| **N8n Config** | WEBHOOK_URL, N8N_CORS_ALLOWED_ORIGINS, N8N_COMMUNITY_PACKAGES_ENABLED, N8N_BLOCK_ENV_ACCESS_IN_NODE, N8N_RUNNERS_TASK_REQUEST_TIMEOUT, NODE_FUNCTION_ALLOW_EXTERNAL |
| **API Keys (pass-through)** | ANTHROPIC_API_KEY, OPENAI_API_KEY, TAVILY_API_KEY, PINECONE_API_KEY, PINECONE_HOST, SAM_GOV_API_KEY |
| **GDA Env Vars (F-035)** | GDA_QA_N8N_API_KEY, GDA_WEBHOOK_HEADER_VALUE, GDA_QA_AGENT_KEY, GDA_FIX_AGENT_KEY, GDA_SAM_API_KEY, GDA_WEBHOOK_HEADER_VALUE_V2, GDA_API_KEY_2026, GDA_DEPLOY_KEY_2026, GDA_WEBHOOK_SECRET_2026, GDA_TAVILY_API_KEY, GDA_DEPLOY_KEY_V2, GDA_DEPLOY_KEY_V2_CP |
| **Timezone** | GENERIC_TIMEZONE |

### Categorized Changes

| Category | Items | Notes |
|----------|-------|-------|
| **(a) Env var additions** | 12 GDA_* vars | Added during F-035 Waves 1–4. All use pass-through syntax (no defaults) |
| **(b) Container-level** | Postgres: port 5432→127.0.0.1:5432. N8n: port 5678, Traefik labels, dual network | Unchanged from initial VPS setup |
| **(c) Service additions** | Redis service | Present since n8n queue mode was enabled |
| **(d) Image/version pins** | pgvector:pg16, redis:6-alpine, n8n:latest (untagged) | No version drift |

## Resolution

1. **Added** `docker-compose.n8n.yml` to repo root — exact copy of VPS file
2. **Validated** syntax via `docker compose config` on VPS
3. **Hash verified:** VPS hash `1993f4da...` == repo hash `1993f4da...` (MD5 match)

## Drift-Detection Guardrail

### CI Check (`compose-drift` job)
- Reads `.github/expected-compose-hashes.txt` (SHA-256 hashes for both compose files)
- Fails CI if any compose file hash doesn't match expected
- Self-healing: any PR that modifies a compose file must also update the hash file

### Deploy-Time Check (`deploy-prod.sh`)
- On every deploy, compares VPS `/root/n8n-envision/docker-compose.yml` hash
  against repo `docker-compose.n8n.yml` hash
- Emits `::warning::COMPOSE DRIFT` if hashes differ (non-blocking — warn only,
  since the deploy script manages the GDA backend, not n8n)

### Files

| File | Purpose |
|------|---------|
| `docker-compose.n8n.yml` | Tracked copy of VPS n8n compose |
| `.github/expected-compose-hashes.txt` | Expected SHA-256 hashes |
| `.github/workflows/ci.yml` | `compose-drift` CI job |
| `scripts/deploy-prod.sh` | Deploy-time drift warning |

## No Container Restart Required

The VPS file and repo file are identical — no changes were applied to the VPS.
Canaries confirmed green before and after this change (no-op on prod).
