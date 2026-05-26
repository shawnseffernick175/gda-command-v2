# F-035 Wave 1 Execution Record

**Date:** 2026-05-26T07:45–07:52 UTC
**Operator:** Devin (session 4e5911da)
**SSH:** root@100.100.80.78 (Tailscale)

## Scope

Remove hardcoded n8n API key (JWT) from 3 workflows, replace with `env('GDA_QA_N8N_API_KEY')` + fail-fast guard.

## Pre-State

| Workflow | ID | Node | Pattern | Hardcoded Literals |
|----------|----|------|---------|--------------------|
| GDA.controlled-fix-agent | akvlbmdUBCgx58PC | Code in JavaScript | A (pure literal) | 1 |
| GDA.qa.agent-runner | TxcPdvx2Ld9rE9er | QA Agent Router | B (env with fallback) | 1 |
| GDA.qa.computer-operator | H6YKZDmLusvQqfIn | QA Agent Router | A (pure literal) | 1 |

**Total hardcoded JWT literals found:** 3 (one per workflow)

## Environment Variable Setup

`GDA_QA_N8N_API_KEY` was NOT present in n8n `.env` or docker-compose.yml.

**Actions taken:**
1. Extracted key value from workflow JSON (length: 289 chars, value NOT logged)
2. Added `GDA_QA_N8N_API_KEY=<value>` to `/root/n8n-envision/.env`
3. Added `GDA_QA_N8N_API_KEY` to docker-compose.yml n8n service `environment:` block
4. Also removed stale `FIRECRAWL_API_KEY` from docker-compose.yml (already removed from .env in F-029 Wave 1)
5. Ran `docker compose up -d n8n` to recreate container with new env
6. Verified inside container: `GDA_QA_N8N_API_KEY length: 289`
7. n8n `/healthz` → HTTP 200

## Refactor Diff (per workflow, sanitized)

### GDA.controlled-fix-agent — Code in JavaScript, line 45

```diff
-const N8N_API_KEY = '<REDACTED_JWT>';
+const N8N_API_KEY = env('GDA_QA_N8N_API_KEY');
+if (!N8N_API_KEY) throw new Error('GDA_QA_N8N_API_KEY env var not set');
```

### GDA.qa.agent-runner — QA Agent Router, line 16

```diff
-const N8N_API_KEY = env('GDA_QA_N8N_API_KEY', '<REDACTED_JWT>');
+const N8N_API_KEY = env('GDA_QA_N8N_API_KEY');
+if (!N8N_API_KEY) throw new Error('GDA_QA_N8N_API_KEY env var not set');
```

### GDA.qa.computer-operator — QA Agent Router, line 20

```diff
-const N8N_API_KEY = '<REDACTED_JWT>';
+const N8N_API_KEY = env('GDA_QA_N8N_API_KEY');
+if (!N8N_API_KEY) throw new Error('GDA_QA_N8N_API_KEY env var not set');
```

## Post-Refactor Verification

| Check | Result |
|-------|--------|
| Hardcoded JWTs in controlled-fix-agent | **0** |
| Hardcoded JWTs in qa.agent-runner | **0** |
| Hardcoded JWTs in qa.computer-operator | **0** |
| `env()` reference in all 3 | **Yes** |
| Unconditional `throw` guard in all 3 | **Yes** |
| Workflows updated via PUT API | 07:49:46 UTC |
| All 3 remain active | **Yes** |

## Negative Test (code review only)

Per task instructions, a live unset of `GDA_QA_N8N_API_KEY` would break all 3 workflows globally on prod. Instead, verified by code review:

- All 3 workflows have: `if (!N8N_API_KEY) throw new Error('GDA_QA_N8N_API_KEY env var not set');`
- The `throw` is unconditional — no fallback, no `|| ''`, no try/catch wrapping
- The `env()` helper function returns `''` (empty string) if the var is unset, which is falsy in JS → throw fires

## Canary Verification

| Workflow | Pre-change (last) | Post-change (first after 07:49) | Status |
|----------|-------------------|--------------------------------|--------|
| system-watchdog | id:119007 07:40:57 success | id:119011 07:50:57 success | OK |
| change-detector | id:119009 07:45:15 success | id:119010 07:50:15 success | OK |

## Sentinel Status

| | Before | After |
|--|--------|-------|
| overall_status | degraded | degraded (no change) |
| writers_24h | degraded | degraded (no change) |

**Sentinel status NOT WORSE than pre-change.** ✓

## Docker-Compose Diff (n8n service environment block)

```diff
 # /root/n8n-envision/docker-compose.yml — n8n service environment:
-      - FIRECRAWL_API_KEY
       - TAVILY_API_KEY
       - PINECONE_API_KEY
       - PINECONE_HOST
       - SAM_GOV_API_KEY
+      - GDA_QA_N8N_API_KEY
```

## n8n .env Diff

```diff
 # /root/n8n-envision/.env (names only)
+GDA_QA_N8N_API_KEY  (length: 289 chars)
```

Total env vars: 31 → 31 (FIRECRAWL_API_KEY was already removed in F-029; GDA_QA_N8N_API_KEY added)
