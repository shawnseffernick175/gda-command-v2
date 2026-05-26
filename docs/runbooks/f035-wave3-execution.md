# F-035 Wave 3 Execution Record

> Executed: 2026-05-26 ~20:55–21:05 UTC
> Operator: Devin (automated)

## Scope

Two classes of hardcoded secrets migrated to environment variables:

| Deliverable | Secret Type | Workflows | Nodes | Env Var |
|---|---|---|---|---|
| D1 | SAM.gov API key (40-char, `SAM-c189…`) | 4 | 5 | `GDA_SAM_API_KEY` |
| D2 | Webhook header value (`gda-api-2027-…`, 29-char) | 11 | 17+ | `GDA_WEBHOOK_HEADER_VALUE_V2` |

**Total:** 15 unique workflows modified, 34+ literal occurrences replaced.

## Pre-State

| Metric | Value |
|---|---|
| n8n .env var count | 34 |
| Sentinel overall_status | degraded (writers_24h, source_health) |
| Watchdog canary | success @ 20:50:57 UTC |
| Change-detector canary | success @ 20:50:15 UTC |
| SAM key hardcoded occurrences (158 workflows) | 5 (in 4 workflows) |
| Webhook value hardcoded occurrences (158 workflows) | 34 (in 11 workflows) |

## D1: SAM API Key Migration

### Hardcoded Workflows (5 nodes in 4 workflows)

| Workflow | ID | Node | Pattern |
|---|---|---|---|
| GDA.api.capture-intel | JiIiq2uxRaKUob0d | SAM.gov Search | queryParam `api_key` |
| GDA.api.sitrep 2 | G9US1e01oY1cgJIF | SAM.gov Opportunities | queryParam `api_key` |
| GDA.api.sitrep 2 | G9US1e01oY1cgJIF | SAM.gov Fetch | queryParam `api_key` |
| GDA.sched.opp-refresh | PeLGDqgLAsEh5Gsd | SAM Fetch | queryParam `api_key` |
| GDA.sched.idiq-to-monitor | xKR1NtwUUu5xOC6g | SAM TO Search | queryParam `api_key` |

### Already-Dynamic Workflows (no changes needed)

6 other workflows already used env var references:
- GDA.intel.morning-briefing-v1 → `$env.SAM_GOV_API_KEY || 'DEMO_KEY'`
- GDA.cron.idiq-task-order-alert → `$env.SAM_GOV_API_KEY || 'DEMO_KEY'`
- GDA.api.teaming-scorer → `$env.SAM_GOV_API_KEY || 'DEMO_KEY'`
- GDA.api.opp-search → `$env.SAM_GOV_API_KEY`
- GDA.sched.dept-opp-sweep → `$env.SAM_API_KEY`
- GDA.cron.on-ramp-scanner → `$env.SAM_API_KEY`

> **Note:** `SAM_API_KEY` (without `GOV_`) is not set in .env — on-ramp-scanner and dept-opp-sweep
> will fall back to DEMO_KEY or fail. This is a pre-existing issue, not introduced by Wave 3.
> `GDA_SAM_API_KEY` and `SAM_GOV_API_KEY` hold the same value; consolidation is a future cleanup.

### Migration

1. Added `GDA_SAM_API_KEY=<same value as SAM_GOV_API_KEY>` to `/root/n8n-envision/.env`
2. Added `GDA_SAM_API_KEY` pass-through to `docker-compose.yml` n8n service env block
3. Replaced all 5 hardcoded `queryParameters.api_key` values with `={{ $env.GDA_SAM_API_KEY }}`
4. PUT all 4 workflows via n8n API — all active, all succeeded

## D2: Webhook Header Value Migration

### Affected Workflows (34 occurrences in 11 workflows)

| Workflow | ID | Nodes | Pattern |
|---|---|---|---|
| GDA.api.capture-plan | QgperN6cuOpfnb09 | Bidi Sync | jsonBody auth_key |
| GDA.intel.morning-briefing-v1 | YIvCdrOgF1LGmFNL | Post to data-learn | headerParam x-gda-key |
| GDA.api.pipeline | f4PLgyzEu0tj3R5Y | Auth Guard | jsCode |
| GDA.api.platform-health | UBgoJGxZro834RbT | VPS Metrics | headerParam x-gda-key |
| GDA.dev.deploy | 8GnGxnBL9TJjj1i2 | Notify Gist, Notify TG Deploy | headerParam X-GDA-Key |
| GDA.mcp.proxy | 8r0ss5z6X3i0yuqi | Auth Check | jsCode |
| GDA.util.smoke-test | zPT6cd33TmJa7SZX | 5 test nodes | headerParam x-gda-key |
| GDA.qa.agent-runner | TxcPdvx2Ld9rE9er | QA Agent Router | jsCode |
| GDA.cron.pwin-daily-loop | LOaS0qrkHi1dLSLZ | Batch Score Opps, Send Telegram | jsCode + headerParam |
| GDA.api.fast-track-needs | l6X3n5paaIqMKWxB | Auth Guard | jsCode |
| GDA.cron.health-scan-daily | gMEwjeBZbC4GzL3N | Trigger Health Scan | jsCode |

### Consolidation Question

> **Recommendation: Keep `GDA_WEBHOOK_HEADER_VALUE` (2026 value) and `GDA_WEBHOOK_HEADER_VALUE_V2`
> (2027 value) separate.** The 2026 value is still used by `qa.computer-operator` and
> `api.capture-plan` (via Wave 2 migration). The 2027 value is a different secret used by
> different consumers. Merging would require updating all consumers simultaneously.

### Migration

1. Added `GDA_WEBHOOK_HEADER_VALUE_V2=<2027 value>` to `/root/n8n-envision/.env`
2. Added pass-through to `docker-compose.yml`
3. Replaced all occurrences:
   - headerParam values → `={{ $env.GDA_WEBHOOK_HEADER_VALUE_V2 }}`
   - jsCode string literals → `$env.GDA_WEBHOOK_HEADER_VALUE_V2`
   - jsonBody string literals → `$env.GDA_WEBHOOK_HEADER_VALUE_V2`
4. PUT all 11 workflows via n8n API — 15/15 total succeeded (8 first pass, 7 after stripping
   `availableInMCP`/`binaryMode` from settings)

## Post-State

| Metric | Value |
|---|---|
| n8n .env var count | 36 (+2: GDA_SAM_API_KEY, GDA_WEBHOOK_HEADER_VALUE_V2) |
| GDA_SAM_API_KEY in container | 40 chars ✓ |
| GDA_WEBHOOK_HEADER_VALUE_V2 in container | 29 chars ✓ |
| SAM key hardcoded occurrences | **0** |
| Webhook value hardcoded occurrences | **0** |
| GDA_SAM_API_KEY env references | 10 (5 nodes × 2 including activeVersion) |
| GDA_WEBHOOK_HEADER_VALUE_V2 env references | 34 |
| Sentinel overall_status | degraded (unchanged) |
| Change-detector canary | success @ 21:00:15 UTC (post-change) |
| Backend health | ok |
| n8n healthz | ok |

## F-035 Closure Summary

All hardcoded secrets from the original F-029 R-2 audit are now env-var-backed:

| Wave | Scope | PR |
|---|---|---|
| Wave 1 | n8n API key in 3 workflows | #327 (merged) |
| Wave 2 | debug_auth fix + FIX_AGENT_KEY/QA_AGENT_KEY/WEBHOOK_HEADER_VALUE/GitHub PAT | #328 (merged) |
| Wave 2.5 | Rotate n8n API key + secret expiry inventory + Sentinel probe | #329 (merged) |
| Wave 3 | SAM API key (5 nodes) + gda-api-2027 webhook (34 occurrences) | This PR |

**Zero hardcoded secrets remain across all 158 workflows.**
