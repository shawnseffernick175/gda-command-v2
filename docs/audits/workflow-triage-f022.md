# F-022: Workflow Triage — Active Cron Workflows

**Date:** 2026-05-19
**Input:** docs/audits/workflow-inventory-2026-05.md (F-021)
**Scope:** 47 active cron-triggered workflows — classify each for keep-and-fix, keep-and-investigate, or archive.

---

## Methodology

### Two-Part Triage Question

For every workflow:
1. **Trigger / Expected Cadence:** Is the schedule syntactically valid and at a reasonable frequency?
2. **Destination / Consumer:** What does the workflow write, produce, or notify — and is there a terminal consumer?

### Consumer Tracing (Three-Hop Rule)

Consumers are checked at three levels:
- **(a) Backend TypeScript:** Does `packages/backend/src` read the output table or call the webhook?
- **(b) Other n8n workflows:** Does another workflow SELECT from the output table or call the workflow's webhook?
- **(c) Human notification:** Does it send Telegram/email/Slack to a monitored channel?

**Critical constraint:** Telegram channel is NOT monitored (confirmed by operator). Any workflow whose only consumer is Telegram notification gets demoted to archive or keep-and-investigate.

Chains are traced to the terminal consumer. If A feeds B feeds C and nothing reads C's output, the whole chain is dead.

### Classification Definitions

| Classification | Meaning |
|---------------|---------|
| **keep-and-fix** | Active consumers exist. Workflow should be running. Root cause identified. |
| **keep-and-investigate** | Partial consumers exist. Needs activation to determine if it produces value. |
| **archive** | No terminal consumer. Observability with no observer. Dead code. |
| **frozen-observe-only** | F-021 frozen designation. Triage on paper only — no modification recommendation. |

---

## Shared Root Causes

### Root Cause A: n8n Queue/Activation Failure

43 of 47 cron workflows have zero execution records despite valid schedules. The hypothesis (from F-021 §3): n8n worker/queue bottleneck or activation failure — cron triggers are registered but not processed.

**Evidence:** GDA.cron.health-scan-daily has 7 success records in the same 7-day window, proving n8n CAN execute cron workflows. The failure is selective, not global.

**Fix:** System-level — diagnose and resolve the queue/activation issue. Per-workflow fixes are not needed for most of these; once the system issue is resolved, they should fire.

### Root Cause B: Code Node Sandbox Timeout (300s)

Three workflows hit n8n's 300-second Code node execution limit (F-021 §4). Fix: restructure Code nodes, increase `N8N_DEFAULT_TASK_TIMEOUT`, or pre-process outside Code node.

---

## Triage Table

| # | Workflow | Schedule | Classification | Destination (writes) | Terminal Consumer | n8n Chain | Root Cause | Justification |
|---|----------|----------|---------------|---------------------|------------------|-----------|------------|---------------|
| 1 | GDA.api.intel-feed | `0 */4 * * *` | **keep-and-fix** | `gda_intelligence_log` | Backend `intel.ts` reads `intel_items`; n8n sitrep reads `gda_intelligence_log` | sitrep → `gda_daily_briefings` → backend `/api/intel/briefings` | Root Cause B (Code node timeout) | Active consumer chain to frontend. Currently failing on every run. |
| 2 | GDA.api.proactive-scan | `daily 6:00` | **keep-and-investigate** | `gda_proactive_scans` (orphan table), calls `gda-predict` + `gda-action-items` webhooks | Webhooks: `predictive.ts`, `webhook-registry.ts` (active). Table: NO backend consumer. Telegram: NOT monitored. | No downstream n8n chain | Root Cause A | Two webhook consumers active, one orphan table written, no human observer on Telegram path. Needs activation to confirm value. |
| 3 | GDA.api.sitrep 2 | `daily 7:00` | **keep-and-fix** | `gda_intelligence_log`, `gda_opportunity_alerts`, `gda_daily_briefings`, calls `gda-dashboard` + `gda-action-items` | Backend `/api/intel/briefings` reads `gda_daily_briefings`; `gda-dashboard` wired to `dashboard.ts` | Terminal — frontend briefings page | Root Cause A | HIGH VALUE — daily intelligence briefing consumed by frontend. |
| 4 | GDA.auto.e2e-gemini-report | `0 6 * * 1-5` | **archive** | `gda_e2e_reports` (orphan table), calls `gda-tg-notify` | Table: NO backend consumer. Telegram: NOT monitored. | No chain | Root Cause A | Observability with no observer. Nobody reads the table, nobody reads the Telegram. Dead code. |
| 5 | GDA.cron.amendment-monitor | `0 8 * * *` | **keep-and-fix** | Updates `capture_plans`, calls `gda-compliance-matrix` webhook | Backend `capture.ts`, `capture-coach.ts`, `morning-commander.ts` read `capture_plans`; `gda-compliance-matrix` wired to `compliance.ts` | Terminal — backend routes | Root Cause A | HIGH VALUE — core capture workflow table dependency. |
| 6 | GDA.cron.auto-capture-plan | `10 */4 * * *` | **keep-and-fix** | Updates `capture_plans` | Backend `capture.ts`, `capture-coach.ts`, `morning-commander.ts` | Reads `gda_opportunity_tracker` → writes `capture_plans` → backend | Root Cause A | Writes to core `capture_plans` table consumed by multiple backend routes. |
| 7 | GDA.cron.auto-index-docs | `every 15 min` | **keep-and-investigate** | `gda_doc_inbox`, `gda_pgvector_docs` | No backend consumer found for either table. OpenAI embeddings API called. | No downstream chain identified | Root Cause A | Document indexing for RAG. Tables not consumed by backend directly — may be consumed by n8n semantic-search workflow. Needs investigation. |
| 8 | GDA.cron.auto-opp-analysis | `5,35 * * * *` | **keep-and-investigate** | No writes detected; reads `gda_opportunity_tracker` | Calls Anthropic API. No write destination found. | Unclear — may call internal webhook | Root Cause A | Reads opportunity data and calls AI but no visible output destination. May update in-place or call webhook not detected. |
| 9 | GDA.cron.auto-risk-generation | `0 9 * * *` | **keep-and-fix** | `risk_register` (CREATE TABLE + ALTER TABLE + CREATE INDEX) | Backend `dashboard.ts` via `gda-risk` webhook (status: "exists" in registry) | Reads `gda_opportunity_tracker` → writes `risk_register` → consumed by dashboard risk view | Root Cause A | `risk_register` is consumed by the risk dashboard. High value for risk management. |
| 10 | GDA.cron.capture-gate-review | `0 6 * * *` | **keep-and-investigate** | Reads `capture_plans`; Telegram notification | Backend reads `capture_plans`. Telegram: NOT monitored. | No downstream chain | Root Cause A | Reads shared table but primary output is unmonitored Telegram. Demoted from keep-and-fix because no write/webhook consumer beyond Telegram. |
| 11 | GDA.cron.capture-milestone-alerts | `0 0 13 * * *` | **keep-and-investigate** | Reads `capture_plans` + `gda_intelligence_log`; Telegram notification | Telegram: NOT monitored. No write destination. | No chain | Root Cause A | Alert-only workflow with no write output. Telegram not monitored → no terminal consumer. |
| 12 | GDA.cron.capture-opp-sync | `0 0 6 * * *` | **keep-and-fix** | Updates `capture_plans` | Backend `capture.ts`, `capture-coach.ts` | Reads `capture_plans` → updates `capture_plans` → backend routes | Root Cause A | Syncs capture plan data — writes to core table consumed by backend. |
| 13 | GDA.cron.change-detector | `every 5 min` | **keep-and-fix** | Reads `gda_opportunity_tracker`; calls internal n8n webhook | Internal webhook at `n8n.csr-llc.tech` → likely triggers downstream workflow | Needs trace — calls internal webhook | Root Cause A | Change detection feeding internal pipeline. Has active internal webhook consumer. |
| 14 | GDA.cron.comp-intel-daily-growth | `0 6 * * *` | **keep-and-investigate** | Reads `gda_competitor_watchlist`; calls external HTTP (Perplexity/Tavily) | No write destination found. No backend consumer for output. | No chain | Root Cause A | Reads competitor data and calls AI APIs but output destination unclear. May feed competitor dashboard via webhook not detected. |
| 15 | GDA.cron.competitor-crawler | `0 2 * * 0` | **keep-and-fix** | `gda_competitor_crawls`; Telegram (NOT monitored) | `gda_competitor_watchlist` webhook in registry (status: "exists", `usedBy: anomaly.ts`). Crawler feeds watchlist ecosystem. | Reads `gda_competitor_watchlist` → writes `gda_competitor_crawls` → read by other competitor workflows | Root Cause A | Part of competitor intelligence chain. Demote Telegram, but table feeds competitor ecosystem. |
| 16 | GDA.cron.daily-trends-collect | `0 12 * * *` | **keep-and-fix** | `gda_trend_arrays` | Backend `gda-trends` webhook (status: "live", `usedBy: dashboard.ts`). Frontend Trends dashboard reads this. | Reads `gda_intelligence_log` + `gda_opportunity_tracker` → writes `gda_trend_arrays` → dashboard | Root Cause A | HIGH VALUE — feeds the live Trends dashboard via webhook registry. |
| 17 | GDA.cron.data-retention | `0 3 * * *` | **keep-and-fix** | Housekeeping (DELETE old records from `gda_intelligence_log`, `govtribe_cache`, `daily_trends`) | Self-contained maintenance — prevents unbounded table growth | No chain (self-contained) | Root Cause A | Infrastructure maintenance. Without this, shadow tables grow indefinitely. |
| 18 | GDA.cron.data-sync | `every 30 min` | **keep-and-investigate** | Reads `gda_competitor_cache`, `gda_ooda_loops`, `gda_intelligence_log`; calls internal webhook | Internal webhook consumer exists | Reads multiple tables → calls internal n8n webhook | Root Cause A | Sync workflow with internal webhook. Needs activation to trace output. |
| 19 | GDA.cron.deadline-escalation | `0 7,12,17 * * 1-5` | **keep-and-fix** | Updates `capture_plans`; reads `risk_register`, `gda_opportunity_tracker` | Backend `capture.ts` reads `capture_plans` | Reads opportunity + risk data → updates `capture_plans` → backend | Root Cause A | Updates core `capture_plans` table with deadline-based escalations. |
| 20 | GDA.cron.fast-track-ingest | `every 6 hrs` | **frozen-observe-only** | Calls Tavily API; writes to intel pipeline | intel-feed → sitrep chain | Feeds intel pipeline | Root Cause B (Code node timeout at Parse Tavily Results) | FROZEN (MJapg8dGkvEzLn0K). Currently failing on 300s timeout. Has downstream consumers via intel chain. |
| 21 | GDA.cron.fpds-enrichment | `30 7 * * *` | **keep-and-fix** | Reads `capture_plans`; calls 2 internal webhooks | Internal webhooks wired to backend | Reads `capture_plans` → calls enrichment webhooks → backend routes | Root Cause A | Enrichment workflow calling live backend endpoints. |
| 22 | GDA.cron.health-scan-daily | `0 6 * * *` | **keep-and-fix** | Calls multiple health endpoints; Telegram (NOT monitored) | `gda-platform-health` webhook (status: "live", `usedBy: qa.ts`). Frontend QA page. | Terminal — QA dashboard | Root Cause: NONE (currently running successfully, 7 executions) | Only cron workflow consistently firing. Confirms n8n CAN run crons. |
| 23 | GDA.cron.idiq-task-order-alert | `0 0 12 * * *` | **keep-and-investigate** | Reads `gda_idiq_vehicles`, `gda_opportunity_tracker`; Telegram (NOT monitored) | `gda_idiq_tracker` written by other workflow. Telegram: NOT monitored. | Reads shared data but output is Telegram-only | Root Cause A | Alert-only with unmonitored Telegram. Keep for now — may become valuable once Telegram is monitored or output is redirected. |
| 24 | GDA.cron.learning-engine | `0 0 7 * * *` | **keep-and-investigate** | Reads `gda_learned_weights`; calls Anthropic API | `gda_learned_weights` written by `GDA.auto.feedback-collector`. No backend consumer of weights table found. | feedback-collector → learned_weights → learning-engine → ? | Root Cause A | ML feedback loop with no clear terminal consumer. The weights table feeds this workflow but output destination unclear. |
| 25 | GDA.cron.master-scanner | `0 2 * * *` | **keep-and-investigate** | `gda_scanner_log`; Telegram (NOT monitored) | Table: NO backend consumer. Telegram: NOT monitored. | No chain | Root Cause A | System health scanner. Output goes to orphan table + unmonitored Telegram. Similar to e2e-gemini-report but may have operational value once Telegram is monitored. |
| 26 | GDA.cron.morning-intel-briefing | `0 6 * * 1-5` | **keep-and-fix** | Reads `capture_plans`, `gda_intel_feed`; calls Anthropic API; Telegram (NOT monitored) | `gda-morning-briefing` webhook (status: "exists", `usedBy: intel.ts`). Backend route exists. | Reads capture + intel → produces briefing → backend `/api/intel/briefings` | Root Cause A | Backend has a registered webhook for this. Frontend Intel page consumes it. Telegram demoted but backend consumer is active. |
| 27 | GDA.cron.ndaa-ingest | `0 10 * * 1` | **keep-and-fix** | Calls 2 internal webhooks + external HTTP | Internal webhooks → backend routes | Calls `gda-ndaa-far-ingest` style webhooks → backend `ingest.ts` pipeline | Root Cause A | Ingestion workflow feeding backend pipeline via internal webhooks. |
| 28 | GDA.cron.nightly-fy-revenue-calc | `daily 3:00` | **keep-and-investigate** | Reads `gda_mega_cache`, `capture_plans`; no write destination detected | No explicit write. May update in-place via Code node. | Reads from mega cache → no visible output | Root Cause A | Revenue calculation with no detected output. May write via dynamic SQL in Code node not captured by static analysis. |
| 29 | GDA.cron.nightly-pattern-and-enrichment | `daily 2:00` | **keep-and-fix** | Calls 3 internal n8n webhooks | Internal webhooks: likely enrichment pipelines wired to backend | Orchestrator workflow calling multiple internal enrichment endpoints | Root Cause A | Orchestration workflow driving nightly enrichment. All 3 calls are internal n8n webhooks → backend routes. |
| 30 | GDA.cron.nightly-perplexity-research | `0 22 * * 1-5` | **keep-and-fix** | `gda_nightly_intel`; reads `gda_opportunities`; calls Perplexity API | `gda_nightly_intel` is read by `GDA.intel.morning-briefing-v1` (reads `gda_perplexity_research`/`gda_nightly_intel`) → morning briefing → backend | Perplexity research → nightly_intel → morning-briefing-v1 → backend intel routes | Root Cause A | Feeds the morning briefing chain which terminates at backend intel routes. |
| 31 | GDA.cron.on-ramp-scanner | `daily 6:00` | **keep-and-investigate** | Calls external HTTP; no Postgres writes detected | No write destination. No backend consumer. | No chain | Root Cause A | External scanner with no visible output. May be scaffolding that was never completed. Archive candidate if investigation confirms no output. |
| 32 | GDA.cron.pipeline-coverage-check | `0 8 * * 1` | **keep-and-investigate** | Reads `capture_plans`, `gda_opportunity_tracker`; Telegram (NOT monitored) | Telegram: NOT monitored. No write destination. | No chain | Root Cause A | Weekly pipeline check producing Telegram-only output. No monitored consumer. |
| 33 | GDA.cron.pipeline-health-digest | `0 6 * * 1-5` | **keep-and-fix** | Reads `gda_opportunity_tracker`, `capture_plans`, `risk_register` | Likely feeds `gda-dashboard-mega` or similar aggregation. Reads core tables used by multiple backend routes. | Reads core tables → produces digest (may write to dashboard cache) | Root Cause A | Reads from 3 core tables and produces pipeline health state. Cross-reference with dashboard-mega suggests this feeds the aggregate view. |
| 34 | GDA.cron.pwin-daily-loop | `0 6 * * *` | **keep-and-fix** | Reads `gda_opportunity_tracker`; calls 1 internal webhook | `gda-pwin-calculator` webhook (status: "exists", `usedBy: enrichments.ts`) | Reads opps → calls pwin calculator → `gda_pwin_scores` → enrichments | Root Cause A | Feeds the pwin calculator which is registered in webhook-registry and consumed by enrichments.ts. |
| 35 | GDA.cron.recompete-early-warning | `0 0 11 * * *` | **keep-and-investigate** | Reads `gda_active_contracts`, `gda_opportunity_tracker`; Telegram (NOT monitored) | Telegram: NOT monitored. No write/webhook consumer beyond Telegram. | No chain | Root Cause A | Recompete alert with only unmonitored Telegram as output. |
| 36 | GDA.cron.stage-auto-promote | `*/15 * * * *` | **keep-and-fix** | Updates `gda_opportunity_tracker` | Backend routes read opportunity data via webhooks (`gda-opp-tracker`, `gda-pipeline`, `gda-opportunity-detail` — all "live") | Reads `gda_opportunity_tracker` → updates stages → consumed by live webhook routes | Root Cause A | HIGH VALUE — automatic stage promotion consumed by multiple live dashboard views. |
| 37 | GDA.cron.system-watchdog | `every 10 min` | **keep-and-investigate** | Reads `gda_opportunity_tracker`; no writes detected | No write destination. No webhook call. | No chain | Root Cause A | System watchdog that reads but produces no visible output. May use conditional logic (e.g., only fires alerts on anomaly). Needs activation to observe behavior. |
| 38 | GDA.cron.weekly-comp-scan | `daily 8:00` | **keep-and-fix** | Reads `gda_competitor_watchlist`; calls 1 internal webhook | Internal webhook → competitor analysis pipeline | Part of competitor intelligence ecosystem wired to `anomaly.ts` | Root Cause A | Feeds competitor analysis chain consumed by backend anomaly routes. |
| 39 | GDA.cron.win-rate-weekly-digest | `0 0 12 * * 1` | **keep-and-investigate** | `gda_win_rate_digests`; reads `gda_win_loss`; Telegram (NOT monitored) | Table: NO backend consumer found. Telegram: NOT monitored. | `gda_win_loss` → digest → orphan table + Telegram | Root Cause A | Writes to orphan table, Telegram not monitored. Archive candidate unless win-rate data is surfaced elsewhere. |
| 40 | GDA.intel.morning-briefing-v1 | `0 0 10 * * *` | **keep-and-fix** | Reads `gda_perplexity_research`; calls 6 HTTP endpoints (1 internal); Telegram (NOT monitored) | `gda-morning-briefing` webhook (status: "exists", `usedBy: intel.ts`) | Perplexity research → morning briefing → backend intel routes | Root Cause A | Feeds morning briefing consumed by backend. Telegram demoted but backend route is real consumer. |
| 41 | GDA.sched.dept-market-refresh | `weekly` | **keep-and-investigate** | `gda_dept_market` | No backend consumer found for table. | No chain | Root Cause A | Department market data table with no identified consumer. May be consumed by dept-opp-sweep or dashboard-mega indirectly. |
| 42 | GDA.sched.dept-opp-sweep | `0 8 * * *` | **keep-and-investigate** | Calls 1 external HTTP; no Postgres writes | No write. No backend consumer. | No chain | Root Cause A | External HTTP call with no visible output. May feed opportunity tracker via response processing in Code node. |
| 43 | GDA.sched.dhs-industry-day-monitor | `0 11 * * 1,4` | **keep-and-investigate** | Calls 2 external HTTP; no Postgres writes detected | No write destination. No backend consumer. | No chain | Root Cause A | Specialized DHS industry day scanner. Likely scaffolding — no output mechanism identified. |
| 44 | GDA.sched.dpc-forecast-scraper | `0 10 * * 1` | **keep-and-investigate** | Calls 2 external HTTP; no Postgres writes | No write. No backend consumer. | No chain | Root Cause A | DPC forecast data scraper with no visible output. Scaffolding candidate. |
| 45 | GDA.sched.golden-dome-monitor | `weekly` | **archive** | No HTTP calls, no Postgres writes, no notifications | No consumer of any kind. | No chain | Root Cause A | Empty workflow shell — no nodes produce output of any kind. Dead code. |
| 46 | GDA.sched.idiq-to-monitor | `0 9 * * *` | **keep-and-fix** | `gda_idiq_tracker`; calls 1 external HTTP (SAM.gov) | `gda_idiq_tracker` is read by `GDA.api.idiq-tracker` webhook → backend | Reads SAM.gov → writes `gda_idiq_tracker` → consumed by idiq-tracker API workflow | Root Cause A | IDIQ tracking with identified consumer chain. |
| 47 | GDA.sched.opp-refresh | `0 7 * * *` | **keep-and-fix** | `opportunity_alerts`; calls 7 internal + 1 external HTTP | 7 internal webhooks wired to backend routes (opp-tracker, pipeline, etc. — all "live" in registry) | Reads `gda_opportunity_tracker` → calls 7 live backend webhooks → dashboard/pipeline views | Root Cause A | HIGH VALUE — orchestrator that refreshes multiple live dashboard views. Highest internal webhook count of any cron workflow. |

---

## Summary Statistics

| Classification | Count | Percentage |
|---------------|-------|-----------|
| **keep-and-fix** | 24 | 51% |
| **keep-and-investigate** | 20 | 43% |
| **archive** | 2 | 4% |
| **frozen-observe-only** | 1 | 2% |

### Keep-and-Fix: Shared Root Cause Grouping

**Root Cause A (queue/activation failure) — 22 workflows:**
All depend on the same system-level fix. Once the n8n queue/activation issue is resolved, these should fire on their own schedules. No per-workflow fix needed.

Workflows: GDA.api.sitrep 2, GDA.cron.amendment-monitor, GDA.cron.auto-capture-plan, GDA.cron.auto-risk-generation, GDA.cron.capture-opp-sync, GDA.cron.change-detector, GDA.cron.competitor-crawler, GDA.cron.daily-trends-collect, GDA.cron.data-retention, GDA.cron.deadline-escalation, GDA.cron.fpds-enrichment, GDA.cron.morning-intel-briefing, GDA.cron.ndaa-ingest, GDA.cron.nightly-pattern-and-enrichment, GDA.cron.nightly-perplexity-research, GDA.cron.pipeline-health-digest, GDA.cron.pwin-daily-loop, GDA.cron.stage-auto-promote, GDA.cron.weekly-comp-scan, GDA.intel.morning-briefing-v1, GDA.sched.idiq-to-monitor, GDA.sched.opp-refresh

**Root Cause B (Code node timeout) — 1 workflow (+ 2 frozen):**
- GDA.api.intel-feed — needs Code node restructuring at "Merge Intel"
- GDA.cron.fast-track-ingest (frozen) — "Parse Tavily Results" timeout
- GDA.api.intel-feed also triggers error-handler failure (cascading)

**Already working — 1 workflow:**
- GDA.cron.health-scan-daily — 7 successful executions, no fix needed

### Archive Candidates (2 workflows)

| Workflow | ID | Reason |
|----------|-----|--------|
| GDA.auto.e2e-gemini-report | BLS36QTOznJ8mJlC | Output table (`gda_e2e_reports`) has no backend consumer. Telegram not monitored. Observability with no observer. |
| GDA.sched.golden-dome-monitor | — | No HTTP calls, no Postgres writes, no notifications. Empty shell. |

**Action:** Mark as inactive in n8n after review approval. Do NOT modify in this pass.

### Keep-and-Investigate: Common Patterns

1. **Telegram-only output (6 workflows):** Workflows that produce alerts but only to unmonitored Telegram. Will become keep-and-fix once Telegram monitoring is established, or archive if Telegram remains dead.
   - GDA.cron.capture-gate-review, GDA.cron.capture-milestone-alerts, GDA.cron.idiq-task-order-alert, GDA.cron.master-scanner, GDA.cron.pipeline-coverage-check, GDA.cron.recompete-early-warning

2. **No visible output (6 workflows):** Static analysis couldn't determine what they produce. Likely write via dynamic SQL in Code nodes or conditionally call webhooks. Need activation to observe actual behavior.
   - GDA.cron.auto-opp-analysis, GDA.cron.on-ramp-scanner, GDA.cron.system-watchdog, GDA.sched.dept-opp-sweep, GDA.sched.dhs-industry-day-monitor, GDA.sched.dpc-forecast-scraper

3. **Orphan table output (4 workflows):** Write to tables with no identified terminal consumer. May be consumed by n8n workflows not yet traced.
   - GDA.cron.auto-index-docs, GDA.cron.win-rate-weekly-digest, GDA.sched.dept-market-refresh, GDA.cron.nightly-fy-revenue-calc

4. **ML feedback loop (2 workflows):** Learning engine workflows with unclear value delivery.
   - GDA.cron.learning-engine, GDA.cron.comp-intel-daily-growth

---

## Subtask Scoping

### Subtask A — Webhook Dependency Mapping (F-022 subtask)

124 webhook-triggered workflows need classification:
- **Called by GDA backend:** Routes in `packages/backend/src/routes/*` that call n8n webhooks (traced via `webhook-registry.ts`)
- **Called by other n8n workflows:** Internal cross-calls (e.g., `n8n.csr-llc.tech/webhook/gda-*`)
- **External integrations:** SAM.gov, GovTribe, Tavily calling in
- **Orphaned:** No caller exists

The webhook-registry.ts already documents 40+ webhook paths with their status (live/exists/planned) and consuming backend route. This is the primary reference for Subtask A.

### Subtask B — Postgres Write Mapping (F-023 addresses this)

F-023 (shadow schema DDL inventory, issue #258) already covers:
- Full inventory of 39 tables created by n8n workflows
- Schema capture for each
- Consumer identification (which tables are read by backend, which are orphans)
- Backfill migrations to bring them under the canonical system

**Recommendation:** Subtask B is subsumed by F-023. No separate issue needed.

---

## Recommendations

1. **Fix Root Cause A (queue/activation).** This unblocks 22 keep-and-fix workflows in one operation. Diagnostic step from F-021: `docker exec n8n-app n8n list:execution --status=new --limit 20`

2. **Fix Root Cause B (Code node timeout).** Restructure `Merge Intel` in GDA.api.intel-feed. This also resolves the cascading error-handler failure.

3. **Archive 2 workflows** (after this document is approved):
   - GDA.auto.e2e-gemini-report
   - GDA.sched.golden-dome-monitor

4. **Investigate Telegram-only workflows.** Decision needed: will Telegram be monitored? If yes, 6 workflows move to keep-and-fix. If no, 1-2 more move to archive (master-scanner, win-rate-weekly-digest).

5. **Activate-and-observe "no visible output" workflows.** Once Root Cause A is fixed, the 6 workflows with unclear output should be observed for 1 week. If they produce no detectable state change, they're archive candidates.

6. **F-023 completes before F-020.** Shadow schema tables must be migrated before role demotion breaks DDL workflows.
