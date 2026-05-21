# Workflow Inventory Audit — May 2026

**Date:** 2026-05-20
**Instance:** n8n.csr-llc.tech
**Method:** n8n REST API v1 (read-only; no workflows modified)
**Scope:** All workflows (active + inactive), all execution records in visible log

---

## Executive Summary

Of **174 active workflows**, only **6 have any execution records** in the visible log (7-day window). The remaining **168 are invisible** — marked active but producing no execution telemetry. This is a critical observability gap: the failure dashboard can only surface workflows that fail loudly. Silent failures and silent non-runs are undetectable.

**Key findings:**

1. **43 of 47 cron-triggered workflows have never fired** (or n8n isn't logging them). Several have sub-hourly schedules (`*/5`, `*/15`, `*/30` min) — if they were firing, we'd see thousands of execution records. They aren't.
2. **123 of 124 webhook-triggered workflows have no execution records.** Webhooks only fire when called, so zero records doesn't necessarily mean broken — but it means we can't distinguish "dormant by design" from "wired but silent."
3. **The frozen `GDA.cron.fast-track-ingest` (ID `MJapg8dGkvEzLn0K`)** is actively failing: `Task request timed out after 300 seconds` at the `Parse Tavily Results` node. The Tavily API is timing out, not a data shape issue. The workflow itself is structurally sound — the external dependency is down or rate-limited.
4. **`GDA.api.intel-feed`** is also failing on every cron run: same timeout pattern at `Merge Intel` node.
5. **Execution log retention appears to be ~7 days.** The oldest execution in the visible log is from 2026-05-13. This explains gaps for older workflows but does NOT explain zero records for workflows with `every 5 min` or `daily` schedules within the retention window.

---

## 1. Execution Log Retention

The n8n Settings API is not exposed (returns `404`). Configuration is not in the GDA repo (no `N8N_*` env vars for pruning in `docker-compose.prod.yml` or `.env` files).

**Observed retention window:**
- Oldest execution in log: **2026-05-13T20:50:59Z** (7 days ago)
- Newest execution in log: **2026-05-20T19:08:23Z** (current)
- Total executions in log: **222** (216 success, 5 error, 1 pending)

**Assessment:** n8n is likely configured with `EXECUTIONS_DATA_MAX_AGE=168` (7 days / 168 hours) or similar pruning. This is the default in many n8n deployments. The low total execution count (222 in 7 days across 174 active workflows) confirms most workflows are genuinely not firing — pruning cannot explain zero records for a `*/5 * * * *` cron that should have produced ~2,016 executions in 7 days.

**However:** `GDA.cron.health-scan-daily` has 7 successful execution records in this same 7-day window. If n8n's global `saveDataSuccessExecution` were set to `none`, those records wouldn't exist. This rules out a global save-setting as the explanation. The most likely cause is a worker/queue bottleneck or activation failure — cron schedules are registered but triggers aren't being processed. See Section 3 for full hypothesis ranking.

**Recommendation:** SSH to the production VPS and run:
```bash
docker exec n8n-app env | grep -i execut
docker exec n8n-app env | grep -i save
docker exec n8n-app env | grep -i prune
```

---

## 2. Workflow Inventory by Trigger Type and Last Execution

### Table A: Cron-Triggered Workflows (47)

| Workflow | Schedule | Last Execution | Status | 7d Runs | 7d Errors |
|----------|----------|----------------|--------|---------|-----------|
| GDA.api.intel-feed | `0 */4 * * *` | 2026-05-20T08:00 | error | 2 | 2 |
| GDA.api.proactive-scan | `daily at 6:00` | never | — | 0 | 0 |
| GDA.api.sitrep 2 | `daily at 7:00` | never | — | 0 | 0 |
| GDA.auto.e2e-gemini-report | `0 6 * * 1-5` | never | — | 0 | 0 |
| GDA.cron.amendment-monitor | `0 8 * * *` | never | — | 0 | 0 |
| GDA.cron.auto-capture-plan | `10 */4 * * *` | never | — | 0 | 0 |
| GDA.cron.auto-index-docs | `every 15 min` | never | — | 0 | 0 |
| GDA.cron.auto-opp-analysis | `5,35 * * * *` | never | — | 0 | 0 |
| GDA.cron.auto-risk-generation | `0 9 * * *` | never | — | 0 | 0 |
| GDA.cron.capture-gate-review | `0 6 * * *` | never | — | 0 | 0 |
| GDA.cron.capture-milestone-alerts | `0 0 13 * * *` | never | — | 0 | 0 |
| GDA.cron.capture-opp-sync | `0 0 6 * * *` | never | — | 0 | 0 |
| GDA.cron.change-detector | `every 5 min` | never | — | 0 | 0 |
| GDA.cron.comp-intel-daily-growth | `0 6 * * *` | never | — | 0 | 0 |
| GDA.cron.competitor-crawler | `0 2 * * 0` | never | — | 0 | 0 |
| GDA.cron.daily-trends-collect | `0 12 * * *` | never | — | 0 | 0 |
| GDA.cron.data-retention | `0 3 * * *` | never | — | 0 | 0 |
| GDA.cron.data-sync | `every 30 min` | never | — | 0 | 0 |
| GDA.cron.deadline-escalation | `0 7,12,17 * * 1-5` | never | — | 0 | 0 |
| GDA.cron.fast-track-ingest | `every 6 hrs` | 2026-05-19T08:00 | error | 1 | 1 |
| GDA.cron.fpds-enrichment | `30 7 * * *` | never | — | 0 | 0 |
| GDA.cron.health-scan-daily | `0 6 * * *` | 2026-05-20T10:00 | success | 7 | 0 |
| GDA.cron.idiq-task-order-alert | `0 0 12 * * *` | never | — | 0 | 0 |
| GDA.cron.learning-engine | `0 0 7 * * *` | never | — | 0 | 0 |
| GDA.cron.master-scanner | `0 2 * * *` | never | — | 0 | 0 |
| GDA.cron.morning-intel-briefing | `0 6 * * 1-5` | never | — | 0 | 0 |
| GDA.cron.ndaa-ingest | `0 10 * * 1` | never | — | 0 | 0 |
| GDA.cron.nightly-fy-revenue-calc | `daily at 3:00` | never | — | 0 | 0 |
| GDA.cron.nightly-pattern-and-enrichment | `daily at 2:00` | never | — | 0 | 0 |
| GDA.cron.nightly-perplexity-research | `0 22 * * 1-5` | never | — | 0 | 0 |
| GDA.cron.on-ramp-scanner | `daily at 6:00` | never | — | 0 | 0 |
| GDA.cron.pipeline-coverage-check | `0 8 * * 1` | never | — | 0 | 0 |
| GDA.cron.pipeline-health-digest | `0 6 * * 1-5` | never | — | 0 | 0 |
| GDA.cron.pwin-daily-loop | `0 6 * * *` | never | — | 0 | 0 |
| GDA.cron.recompete-early-warning | `0 0 11 * * *` | never | — | 0 | 0 |
| GDA.cron.stage-auto-promote | `*/15 * * * *` | never | — | 0 | 0 |
| GDA.cron.system-watchdog | `every 10 min` | never | — | 0 | 0 |
| GDA.cron.weekly-comp-scan | `daily at 8:00` | never | — | 0 | 0 |
| GDA.cron.win-rate-weekly-digest | `0 0 12 * * 1` | never | — | 0 | 0 |
| GDA.intel.morning-briefing-v1 | `0 0 10 * * *` | never | — | 0 | 0 |
| GDA.sched.dept-market-refresh | `weekly` | never | — | 0 | 0 |
| GDA.sched.dept-opp-sweep | `0 8 * * *` | never | — | 0 | 0 |
| GDA.sched.dhs-industry-day-monitor | `0 11 * * 1,4` | never | — | 0 | 0 |
| GDA.sched.dpc-forecast-scraper | `0 10 * * 1` | never | — | 0 | 0 |
| GDA.sched.golden-dome-monitor | `weekly` | never | — | 0 | 0 |
| GDA.sched.idiq-to-monitor | `0 9 * * *` | never | — | 0 | 0 |
| GDA.sched.opp-refresh | `0 7 * * *` | never | — | 0 | 0 |

**Assessment:** 43 of 47 cron workflows show zero executions. Schedules are syntactically valid (standard cron expressions). The most damning evidence: `GDA.cron.change-detector` runs every 5 minutes, `GDA.cron.auto-opp-analysis` runs every 30 minutes, and `GDA.cron.stage-auto-promote` runs every 15 minutes. If any of these were actually firing, we'd see hundreds of records in the 7-day log. They aren't firing, or n8n is configured to not save successful execution data.

### Table B: Webhook-Triggered Workflows with Executions (1 of 124)

| Workflow | Last Execution | Status | 7d Runs |
|----------|----------------|--------|---------|
| GDA.api.launchpad-funnel | 2026-05-20T19:08 | success | 208 |

**123 additional webhook workflows** have zero execution records in the visible log. Webhooks only fire when called — zero records does not necessarily mean broken. However, without mapping which webhooks are actually wired into the GDA backend (`ingest.ts` routes, n8n proxy calls), we cannot determine which are dormant-by-design vs. which should be receiving traffic but aren't.

### Table C: Inactive Workflows (11)

| Workflow | ID | Notes |
|----------|----|-------|
| GDA.auto.incumbent-enrichment | `oYwPpPdNCixRKItz` | **DELETED 2026-05-21** (F-022 Cat A — never executed, manual trigger) |
| GDA.batch.doc-ingest | `lcZkdOog2DOuMPgB` | **DELETED 2026-05-21** (F-022 Cat B — no caller found) |
| GDA.cron.fast-track-ingest | `bU3PjkpSuVZP8Zue` | Old version; active version at `MJapg8dGkvEzLn0K` |
| GDA.doctrine.finalize-sprint | `qn4h5DQrv4g0KL95` | |
| GDA.ingest.govtribe-cron | `5KuF4KZ8uxYcbUN5` | Superseded by GDA backend MCP poll (PR #237) |
| GDA.oneshot.create-approval-queue-table | `85vEBTRvzw8nAgS8` | One-shot migration |
| GDA.oneshot.seed-feedback-s203 | `gBCN4PXeAdjZa3xI` | One-shot seed |
| GDA.util.gist-update | `gxRweKRZXiouvWUw` | Duplicate |
| GDA.util.gist-update | `3ewzE1DpagLYFiyf` | **DELETED 2026-05-21** (F-022 Cat B — inactive, active replacement t2209zk3c9x0OS9S) |
| GDA.util.oneshot-schema-fix-rr38 | `eggRyGUueMkIJxgf` | One-shot fix |
| GDA.util.read-jsx-temp | `g9wMu2M7i1F7mY86` | Temp utility |

---

## 3. Non-Firing Cron Workflows — Root Cause Analysis

### Patterns Observed

All 43 non-firing cron workflows share these characteristics:
- **Valid cron expressions** — every schedule parses correctly
- **No conditional logic at trigger node** — the Schedule Trigger nodes have no `If` or `Switch` guards
- **Active = true** in n8n — the toggle is on
- **Zero executions in 7-day log** — not even failed attempts

### Hypotheses (ranked by likelihood)

1. **n8n worker/queue bottleneck or activation failure** — If n8n is running in queue mode with limited workers, cron triggers may be queuing but never getting processed. The single execution in `new` status (exec ID 100943) is direct evidence of queued-but-not-started work. Alternatively, an n8n restart may not have reloaded cron schedules, or a timezone mismatch between the server and the cron expressions could prevent triggers from firing. This hypothesis is ranked first because it explains the data cleanly: `GDA.cron.health-scan-daily` has 7 success records in the same 7-day window — if `saveDataSuccessExecution` were globally set to `none`, those records wouldn't exist.

2. **`saveDataSuccessExecution` set per-workflow** — It's possible (but unlikely) that `health-scan-daily` has a workflow-level override that saves success data while the global setting is `none`. This would require n8n's per-workflow `saveDataSuccessExecution` setting to be explicitly overridden on that one workflow. This is testable: check the workflow JSON for `settings.saveDataSuccessExecution`.

3. **Workflows are genuinely dormant by design** — Some of these workflows may have been created as scaffolding or prototypes and were never intended to run. The naming convention (`GDA.cron.*`) suggests they should be running, but without documentation of which workflows are expected to be active, we can't distinguish dormant-by-design from silently broken.

### Recommended Investigation Steps

```bash
# 1. Check n8n execution save settings
docker exec n8n-app env | grep -iE 'execut|save|prune'

# 2. Check n8n queue mode
docker exec n8n-app env | grep -iE 'queue|worker|redis'

# 3. Check n8n timezone
docker exec n8n-app env | grep -iE 'tz|timezone|generic_timezone'

# 4. Check if cron triggers are actually registered
docker exec n8n-app n8n list:workflow --active | head -20

# 5. Check for queued-but-not-started executions (tests queue bottleneck hypothesis)
docker exec n8n-app n8n list:execution --status=new --limit 20
```

---

## 4. Code Node Sandbox Timeout — One Root Cause, Three Workflows

All three failing workflows (`GDA.cron.fast-track-ingest`, `GDA.api.intel-feed`, `GDA.error.handler`) are hitting the same infrastructure constraint: n8n's 300-second Code node sandbox timeout. The fix shape is the same for all three — rewrite as smaller Code nodes that complete within the limit, increase the `N8N_DEFAULT_TASK_TIMEOUT` setting, or pre-process data outside the Code node (e.g., via HTTP Request node transforms). This is one bottleneck to fix, not three independent failures.

### 4a. GDA.cron.fast-track-ingest

**Workflow:** GDA.cron.fast-track-ingest (ID: `MJapg8dGkvEzLn0K`)
**Note:** The user referred to this as "GDA.api.ingest" — the ID maps to `GDA.cron.fast-track-ingest`.

#### Error Detail

| Field | Value |
|-------|-------|
| Execution ID | 113312 |
| Started | 2026-05-19T08:00:01.031Z |
| Stopped | 2026-05-19T08:00:04.409Z (3.4s) |
| Status | error |
| Error | `Task request timed out after 300 seconds` |
| Failed Node | `Parse Tavily Results` |

### Architecture

```
Cron Trigger (every 6h)
  ├─ SAM Atom Feed ─────── Parse SAM Results ─┐
  ├─ Tavily SETA Opps ──── Parse Tavily Results ─┤─ Merge All Signals ─ Check Has Signals ─ Upsert Signal
  └─ Tavily C5ISR Opps ──────────────────────────┘
```

#### Diagnosis

The workflow fails at `Parse Tavily Results`, which is a Code node (JavaScript) that processes the HTTP response from the Tavily API. The 300-second timeout is n8n's default task execution limit, not a network timeout — the Code node itself is hanging, likely because the Tavily HTTP request before it returned an unexpected response shape (empty, error page, or very large payload) and the parsing code enters an infinite loop or unbounded processing.

**Key observation:** The workflow completed in 3.4 seconds — far less than 300 seconds. This suggests the timeout error may be from a previous execution attempt that was retried, or n8n is reporting the timeout from the Code node's sandbox, not the overall execution.

#### Impact Assessment

- **Ingest is broken.** `GDA.cron.fast-track-ingest` is the real-time ingest pipeline for SAM and Tavily signals. It has been failing since at least 2026-05-19.
- **Not a data shape issue.** The failure is in the Tavily API call/parse path, not in downstream consumers.
- **SAM Atom Feed path may be functional** — the error is isolated to the Tavily branch. If the workflow has error handling that allows partial execution, SAM data may still be flowing.

### 4b. GDA.api.intel-feed

| Execution | Error | Node |
|-----------|-------|------|
| 2026-05-20T08:00 | `Task request timed out after 300 seconds` | `Merge Intel` |
| 2026-05-19T08:00 | `Task request timed out after 300 seconds` | `Merge Intel` |

Same 300-second Code node sandbox timeout. `GDA.api.intel-feed` runs `0 */4 * * *` (every 4 hours) and has failed on both recorded executions. The `Merge Intel` node is a Code node performing the same type of JavaScript processing.

### 4c. GDA.error.handler (cascading failure)

Two `crashed` executions on 2026-05-19. The error handler itself is crashing — errors from `intel-feed` and `fast-track-ingest` fire the error handler, which then also hits the sandbox timeout. This is a cascading failure: the shared Code node timeout limit breaks error recovery too.

---

## 5. Proposed Inventory Framework

For ongoing weekly audits, each workflow should be tracked across these dimensions:

| Dimension | Description | Source |
|-----------|-------------|--------|
| **Status** | active / inactive / archived / frozen | n8n API `active` field + manual frozen list |
| **Trigger Type** | cron / webhook / manual / event | Workflow JSON node types |
| **Schedule** | Cron expression or trigger description | Schedule Trigger node params |
| **External Dependencies** | Postgres, OpenAI, GovTribe, Tavily, SAM.gov, Perplexity, Telegram, etc. | Workflow JSON node types + HTTP request URLs |
| **Safety Lane** | read-only / write / test / unknown | Inferred from workflow name + node types |
| **Last Successful Execution** | Timestamp of most recent `status=success` execution | n8n Executions API |
| **7-Day Success Rate** | `successes / (successes + errors)` over 7 days | n8n Executions API |
| **7-Day Failure Rate** | `errors / (successes + errors)` over 7 days | n8n Executions API |
| **Median Duration** | p50 execution time over 7 days | n8n Executions API `startedAt` / `stoppedAt` |
| **Expected Frequency** | How often this workflow SHOULD fire (from schedule or integration docs) | Manual annotation |
| **Actual Frequency** | How often it DID fire in the last 7 days | n8n Executions API count |
| **Drift** | `actual / expected` — values < 0.8 indicate under-firing | Computed |

### Category Refinements from User's Suggested Framework

The user's suggested categories were: status, trigger type, external dependencies, safety lane, last successful execution, 7-day success rate, 7-day failure rate, median duration.

**Additions:**
- **Expected Frequency** + **Actual Frequency** + **Drift** — This is the core metric that catches the F-021 pattern. Without it, you know a workflow exists but not whether it's running at the cadence it should.
- **Schedule** — Needed to compute Expected Frequency automatically.

**Refinements:**
- **Safety Lane** should be manually annotated, not inferred from names. The name `GDA.cron.data-sync` could be read-only (sync = pull) or write (sync = push). The workflow JSON tells us which Postgres nodes are `SELECT` vs `INSERT/UPDATE/DELETE`.
- **External Dependencies** should include version/tier where applicable (e.g., "OpenAI gpt-4o" vs "OpenAI gpt-3.5-turbo") since API changes at the dependency level are a common failure mode.

---

## 6. Recurring Artifact Proposal

**Question:** "How do we make this a recurring weekly artifact, like the drift report for migrations?"

**Prerequisite: F-022 triage pass.** The alert rules proposed below would fire on 43 cron workflows simultaneously on the first run — that's a wall of red that gets ignored, not an alert system. Before automating, the 168 silent workflows need a one-pass triage (F-022): classify each as (a) should be running → fix the root cause, or (b) should be archived/disabled → deactivate. Only after triage should alerts be gated on the "should be running" set.

**Proposed approach (post-F-022):** A GitHub Action (`.github/workflows/workflow-inventory.yml`) that runs weekly on Monday at 07:00 UTC (after the drift report at 06:00):

1. Calls the n8n API to pull all workflows and recent executions
2. Generates the inventory table as markdown
3. Computes drift metrics (actual vs expected frequency)
4. Opens a GitHub Issue with the inventory snapshot and any alerts
5. Alerts fire when:
   - A workflow in the "should be running" set (from F-022 triage) has 0 executions in the last 7 days
   - A workflow's 7-day success rate drops below 80%
   - A workflow's median duration exceeds 2x its historical baseline

**Implementation cost:** ~100 lines of TypeScript (similar to `check-migration-drift.ts`). Requires `N8N_API_KEY` as a GitHub Actions secret. Depends on F-022 triage output for the alert allowlist.

**Alternative:** Extend the existing `GDA.cron.health-scan-daily` workflow (one of the 4 that actually works) to include workflow inventory metrics in its health report. This has the advantage of using n8n to monitor n8n — but the disadvantage of depending on the system being monitored.

---

## Appendix: Raw Statistics

| Metric | Value |
|--------|-------|
| Total workflows | 179 (6 deleted F-022 2026-05-21) |
| Active workflows | 170 (4 active orphans deleted F-022) |
| Inactive workflows | 9 (2 inactive orphans deleted F-022) |
| Active with executions in log | 6 |
| Active with zero executions | 164 (was 168; 4 active orphans deleted F-022) |
| Cron-triggered (active) | 47 |
| Cron with zero executions | 43 |
| Webhook-triggered (active) | 121 (was 124; 3 webhook orphans deleted F-022) |
| Webhook with executions | 1 |
| Other trigger (active) | 2 (was 3; 1 form-trigger orphan deleted F-022) |
| Total executions in log | 222 |
| Successful executions | 216 |
| Error executions | 5 |
| Pending executions | 1 |
| Log retention window | ~7 days (2026-05-13 to 2026-05-20) |
| Audit timestamp | 2026-05-20T20:00Z |

---

## Appendix: F-022 Workflow Deletions (2026-05-21)

6 workflows deleted from n8n after F-022 Category A + Category B triage.
All deletions executed post-F-026 Step 2 (network bridge closed green).

| Workflow | ID | Category | Justification |
|----------|----|----------|---------------|
| GDA.form.white-glove-upload | `zyfMktOTcm57NbWy` | Cat A (DEAD) | Active but never executed, form trigger, created Apr 9. Path collision with white-glove-receiver. |
| GDA.batch.white-glove-receiver | `uBjp6lDUmIB7qXBJ` | Cat B (ORPHAN) | Active webhook trigger, zero executions, no caller in repo/backend/VPS/CI. Path collision with white-glove-upload. |
| GDA.batch.doc-ingest | `lcZkdOog2DOuMPgB` | Cat B (ORPHAN) | Active webhook trigger, zero executions, no caller found. Active replacement `GDA.api.doc-ingest` serves same function. |
| GDA.auto.incumbent-enrichment | `oYwPpPdNCixRKItz` | Cat A (DEAD) | Inactive, manual trigger, never executed, created Apr 21. |
| GDA.util.gist-update | `3ewzE1DpagLYFiyf` | Cat B (ORPHAN) | Inactive duplicate. Active replacement `t2209zk3c9x0OS9S` serves same webhook path. |
| GDA.event.opp-cross-wire | `pkhbZBYzr6O93XAs` | Cat B (ORPHAN) | Active webhook, zero executions. Calls pwin-calculator (WIRED) but also calls non-existent `/webhook/gda-ooda-loop` (real path is `/webhook/gda-ooda`). Dead scaffolding. |

**Grep pre-check:** "white-glove", "white-glove-upload", "/form/white-glove-upload" — only matches in `All Perplexity/` baseline snapshots (historical). No active code, docs, or external references.

**Cat A comment:** [#257](https://github.com/shawnseffernick175/gda-command-v2/issues/257#issuecomment-4513007362)
**Cat B comment:** [#257](https://github.com/shawnseffernick175/gda-command-v2/issues/257#issuecomment-4513111854)
**Chain analysis:** [#257](https://github.com/shawnseffernick175/gda-command-v2/issues/257#issuecomment-4513170675)
