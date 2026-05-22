# F-026 Step 4 — Workflow Repointing: n8n Credential Cutover

**Author:** Devin  
**Date:** 2026-05-22  
**Status:** DRAFT — awaiting architect review  
**Parent issue:** F-026 (DB consolidation)  
**Prerequisite PRs:** #294 (Step 3 plan), #295 (Step 3 script + rehearsal), #296 (schema apply), #297 (prod data migration)

---

## 0. Phase 0 — Table-Existence Matrix (Mandatory Pre-Flight)

### ⚠ HALT GATE: This section must pass before Step 4 PR 2 is opened.

The 122 workflows that use HwronxMmGY5XDGEt currently connect to `n8n-envision-postgres-1/n8n`.
After the credential cutover, they will connect to `gda-postgres/gda_command`. Any table
that exists on the n8n DB but NOT on gda_command will cause workflow failures post-cutover.

### 0a. Table-Existence Matrix

Analysis of SQL queries embedded in the 122 workflows identified **58 distinct tables**
referenced. Cross-referencing against both databases (plus 2 GDA-only tables for completeness):

| Table | n8n DB | gda_command | Category | Rows (n8n) | Impact |
|-------|:------:|:-----------:|----------|------------|--------|
| **28 ADOPT tables (migrated in Step 3)** | | | | | |
| daily_trends | ✅ | ✅ | ADOPT | 537 | Safe — exists on both |
| ft_opportunity_signal | ✅ | ✅ | ADOPT | 234 | Safe — exists on both |
| ft_signal_source | ✅ | ✅ | ADOPT | 10 | Safe — exists on both |
| gda_action_items | ✅ | ✅ | ADOPT | 47 | Safe — exists on both |
| gda_active_contracts | ✅ | ✅ | ADOPT | 5 | Safe — exists on both |
| gda_capture_plans | ✅ | ✅ | ADOPT | 110 | Safe — exists on both |
| gda_competitor_cache | ✅ | ✅ | ADOPT | 1 | Safe — exists on both |
| gda_competitor_watchlist | ✅ | ✅ | ADOPT | 46 | Safe — exists on both |
| gda_contacts | ✅ | ✅ | ADOPT | 2 | Safe — exists on both |
| gda_dashboard_intel_cache | ✅ | ✅ | ADOPT | 6 | Safe — exists on both |
| gda_embeddings | ✅ | ✅ | ADOPT | 821 | Safe — exists on both |
| gda_error_log | ✅ | ✅ | ADOPT | 334 | Safe — exists on both |
| gda_intelligence_log | ✅ | ✅ | ADOPT | 54 | Safe — exists on both |
| gda_learned_weights | ✅ | ✅ | ADOPT | 18 | Safe — exists on both |
| gda_morning_briefings | ✅ | ✅ | ADOPT | 40 | Safe — exists on both |
| gda_opportunity_alerts | ✅ | ✅ | ADOPT | 7 | Safe — exists on both |
| gda_opportunity_tracker | ✅ | ✅ | ADOPT | 1780 | Safe — exists on both |
| gda_relationships | ✅ | ✅ | ADOPT | 0 | Safe — exists on both |
| gda_risk_register | ✅ | ✅ | ADOPT | 464 | Safe — exists on both |
| gda_saved_opportunities | ✅ | ✅ | ADOPT | 0 | Safe — exists on both |
| gda_teaming_partners | ✅ | ✅ | ADOPT | 12 | Safe — exists on both |
| gda_touchpoints | ✅ | ✅ | ADOPT | 0 | Safe — exists on both |
| gda_trend_arrays | ✅ | ✅ | ADOPT | 15 | Safe — exists on both |
| gda_wargames | ✅ | ✅ | ADOPT | 1 | Safe — exists on both |
| gda_win_loss | ✅ | ✅ | ADOPT | 6 | Safe — exists on both |
| gda_win_loss_db | ✅ | ✅ | ADOPT | 10 | Safe — exists on both |
| govtribe_cache | ✅ | ✅ | ADOPT | 0 | Safe — exists on both |
| opportunity_alerts | ✅ | ✅ | ADOPT | 2 | Safe — exists on both |
| | | | | | |
| **30 N8N-ONLY tables (exist on n8n, NOT on gda_command)** | | | | | |
| gda_action_history | ✅ | ❌ | N8N-ONLY | 6 | **BREAKS** after cutover |
| gda_ai_feedback | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_aop_tracker | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_approval_queue | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_capture_lessons | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_chat_history | ✅ | ❌ | N8N-ONLY | 6 | **BREAKS** after cutover |
| gda_clause_library | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_competitor_crawls | ✅ | ❌ | N8N-ONLY | 30 | **BREAKS** after cutover |
| gda_compliance_matrices | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_contract_vehicles | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_daily_briefings | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_daily_briefs | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_deep_research | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_dept_market | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_discussions | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_doc_inbox | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_e2e_reports | ✅ | ❌ | N8N-ONLY | 27 | **BREAKS** after cutover |
| gda_feedback | ✅ | ❌ | N8N-ONLY | 8 | **BREAKS** after cutover |
| gda_health_scans | ✅ | ❌ | N8N-ONLY | 3 | **BREAKS** after cutover |
| gda_idiq_tracker | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_incumbent_analysis | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_knowledge_base | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_learning_log | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_meeting_notes | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_mega_cache | ✅ | ❌ | N8N-ONLY | 1 | **BREAKS** after cutover |
| gda_naics_tracking | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_ndaa_intel | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_ooda_loops | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_prompt_architect_memory | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| gda_pwin_scores | ✅ | ❌ | N8N-ONLY | 0 | **BREAKS** after cutover |
| | | | | | |
| **2 GDA-ONLY tables (exist on gda_command, not referenced from n8n)** | | | | | |
| doctrine_drafts | ❌ | ✅ | GDA-ONLY | — | Safe — already on target |
| doctrine_publish_runs | ❌ | ✅ | GDA-ONLY | — | Safe — already on target |

### 0b. Summary

| Category | Count | Status |
|----------|-------|--------|
| ADOPT (both DBs) | 28 | ✅ Safe — migrated in Step 3 |
| N8N-ONLY | **30** | **🛑 HALT — will break after cutover** |
| GDA-ONLY | 2 | ✅ Safe — already on target DB |

### 0c. The problem

The 30 N8N-ONLY tables are shadow tables classified as **KEEP** in the F-023 inventory
(docs/audits/f023-shadow-schema-2026-05-22.md). They were not part of the 28-table ADOPT
set because they were deemed lower-priority or had no active writer workflows at the time
of classification.

However, **the 122 workflows that use HwronxMmGY5XDGEt reference these tables in their SQL
queries.** After the credential cutover, these queries will fail with
`ERROR: relation "gda_chat_history" does not exist` (or similar) because gda_command has
no such tables.

### 0d. Activity profile of the 30 N8N-ONLY tables

| Activity Level | Tables | Count |
|---------------|--------|-------|
| Active writes (INS > 0) | gda_competitor_crawls(30), gda_e2e_reports(27), gda_feedback(8), gda_chat_history(6), gda_action_history(6), gda_health_scans(3) | 6 |
| Active updates only | gda_mega_cache(131 UPD), gda_dept_market(24 UPD) | 2 |
| Empty / zero activity | All others | 22 |

### 0e. Resolution options (architect decision required)

1. **Expand ADOPT scope:** Generate migrations for the 30 tables, copy data, then proceed
   with Step 4. This is the same pattern as F-023c + Step 3 but for a larger set. Adds
   ~81 total rows of data. Most tables are empty.

2. **Create empty table stubs:** Generate CREATE TABLE migrations for the 30 tables on
   gda_command WITHOUT copying data. Workflows would read empty results instead of failing.
   Data copy can follow later. Quick but loses the 81 rows of existing data.

3. **Split the credential:** Keep HwronxMmGY5XDGEt pointing at n8n DB for the 30 N8N-ONLY
   tables, and create a NEW credential pointing at gda_command for the 28 ADOPT tables.
   Requires per-workflow node edits — contradicts Option A (edit in place) and is complex.

4. **Accept breakage:** Proceed knowing the 30 tables will 404. Most are empty, and the
   workflows may handle the error gracefully (returning empty arrays). Risk: some workflows
   may crash entirely and stop serving API responses.

**Recommendation:** Option 1 (expand ADOPT scope). It's the cleanest path. The 30 tables
have minimal data (81 rows total across 8 non-empty tables). The same pg_dump/pg_restore
pattern from Step 3 applies.

### 0f. HALT condition

**This matrix must be resolved before Step 4 PR 2 (execution) begins.** If the architect
approves Option 1, a new sub-step (Step 3b: migrate the 30 additional tables) must be
completed first.

---

## 1. Preconditions

Before execution, verify each of the following. HALT on any failure.

### 1a. Step 3 closure state

```bash
# Verify 28 ADOPT tables populated, 4,562 row total
docker exec gda-postgres psql -U gda -d gda_command -t -c "
SELECT sum(cnt) FROM (
  SELECT count(*) AS cnt FROM gda_relationships UNION ALL
  SELECT count(*) FROM ft_signal_source UNION ALL
  SELECT count(*) FROM gda_touchpoints UNION ALL
  SELECT count(*) FROM ft_opportunity_signal UNION ALL
  SELECT count(*) FROM gda_risk_register UNION ALL
  SELECT count(*) FROM gda_opportunity_tracker UNION ALL
  SELECT count(*) FROM gda_capture_plans UNION ALL
  SELECT count(*) FROM gda_intelligence_log UNION ALL
  SELECT count(*) FROM gda_competitor_watchlist UNION ALL
  SELECT count(*) FROM opportunity_alerts UNION ALL
  SELECT count(*) FROM gda_competitor_cache UNION ALL
  SELECT count(*) FROM gda_action_items UNION ALL
  SELECT count(*) FROM gda_active_contracts UNION ALL
  SELECT count(*) FROM gda_dashboard_intel_cache UNION ALL
  SELECT count(*) FROM daily_trends UNION ALL
  SELECT count(*) FROM gda_opportunity_alerts UNION ALL
  SELECT count(*) FROM gda_morning_briefings UNION ALL
  SELECT count(*) FROM gda_learned_weights UNION ALL
  SELECT count(*) FROM gda_win_loss UNION ALL
  SELECT count(*) FROM gda_error_log UNION ALL
  SELECT count(*) FROM gda_saved_opportunities UNION ALL
  SELECT count(*) FROM gda_teaming_partners UNION ALL
  SELECT count(*) FROM gda_embeddings UNION ALL
  SELECT count(*) FROM govtribe_cache UNION ALL
  SELECT count(*) FROM gda_wargames UNION ALL
  SELECT count(*) FROM gda_win_loss_db UNION ALL
  SELECT count(*) FROM gda_trend_arrays UNION ALL
  SELECT count(*) FROM gda_contacts
) t;"
# Expect: >= 4562. Total may exceed 4,562 if writers have added rows since Step 3.
# HALT if total is LESS than 4,562 (would indicate data loss).
```

```bash
# Verify constraint checks still pass
# FK chain 1: gda_touchpoints → gda_relationships
docker exec gda-postgres psql -U gda -d gda_command -t -c "
SELECT count(*) FROM gda_touchpoints t
LEFT JOIN gda_relationships r ON t.relationship_id = r.id
WHERE r.id IS NULL AND t.relationship_id IS NOT NULL;"
# Expect: 0

# FK chain 2: ft_opportunity_signal → ft_signal_source
docker exec gda-postgres psql -U gda -d gda_command -t -c "
SELECT count(*) FROM ft_opportunity_signal s
LEFT JOIN ft_signal_source src ON s.source_id = src.source_id
WHERE src.source_id IS NULL AND s.source_id IS NOT NULL;"
# Expect: 0
```

**HALT if:** Total row count < 4,562, or any FK orphans detected.

### 1b. gda-backend health

```bash
curl -s https://gda.csr-llc.tech/health | python3 -c "import sys,json; print(json.load(sys.stdin))"
docker ps --filter name=gda-backend --format "{{.Names}} {{.Status}} {{.Image}}"
```

Record: container age, image ID, current uptime. The backend is running image
`gda-command-v2-backend:latest` (ImageID `sha256:1b8ca37f1e56...`), built 2026-05-20,
container created 2026-05-21T17:38:13Z. This is the **pre-PR#288 code**.

### 1c. Writer workflow status

```bash
# Verify all 17 writers from docs/audits/f026-step3-writer-workflows-20260522.md are active
# Use n8n API to check each
for WF_ID in ldVAxgDGuKJx4354 Qg55lRKjubgsvD28 9annZcPoqw0DaPKI PeLGDqgLAsEh5Gsd \
  BQFYbILTezLgqkDY 0E3lCtWt2rdJlMPY MJapg8dGkvEzLn0K M0xPvRs31zQOewfx \
  7gERqvfD6THg1gWf EcZWryEoS4zyAfGD geW4zw6lvkkizF82 IGw8FBZhZwnwiIe1 \
  Zb2quk78c5mszZ2C gMEwjeBZbC4GzL3N KIT8cj4V2cMFdSkA lU2uQfmQ6sch69TA \
  D6nZ235hSF4wGMb5; do
  curl -s "http://localhost:5678/api/v1/workflows/$WF_ID" \
    -H "X-N8N-API-KEY: $API_KEY" | python3 -c "
import sys,json; d=json.load(sys.stdin); print(d['id'], d['name'], 'active' if d['active'] else 'INACTIVE')"
done
```

**HALT if:** Any of the 17 writers is inactive (would indicate they weren't properly
resumed after Step 3).

### 1d. No in-flight writes

```bash
# Check last execution time for each writer. All should have completed > 30 seconds ago.
for WF_ID in ldVAxgDGuKJx4354 Qg55lRKjubgsvD28 9annZcPoqw0DaPKI PeLGDqgLAsEh5Gsd \
  BQFYbILTezLgqkDY 0E3lCtWt2rdJlMPY MJapg8dGkvEzLn0K M0xPvRs31zQOewfx \
  7gERqvfD6THg1gWf EcZWryEoS4zyAfGD geW4zw6lvkkizF82 IGw8FBZhZwnwiIe1 \
  Zb2quk78c5mszZ2C gMEwjeBZbC4GzL3N KIT8cj4V2cMFdSkA lU2uQfmQ6sch69TA \
  D6nZ235hSF4wGMb5; do
  curl -s "http://localhost:5678/api/v1/executions?workflowId=$WF_ID&limit=1&status=running" \
    -H "X-N8N-API-KEY: $API_KEY" | python3 -c "
import sys,json; d=json.load(sys.stdin); execs=d.get('data',[]); \
print(f'Running: {len(execs)}')"
done
# Expect: 0 running for all 17
```

**HALT if:** Any workflow has a running execution. Wait for it to complete before proceeding.

### 1e. Password retrieval

```bash
# Retrieve gda password from compose env
cat /root/gda-command-v2/.env | grep POSTGRES_PASSWORD
# HALT if password is a placeholder, empty, or cannot be retrieved.
# Do NOT include the password value in any committed file or PR description.
# Reference as "gda password from compose env" only.
```

### 1f. VPS repo state

```bash
cd /root/gda-command-v2
git log --oneline -1
# Expect: SHA matches post-PR#297 (64d2fad)
git status
# Expect: clean working tree
# HALT if either check fails — stale state on VPS.
```

### 1g. Halt conditions summary

| # | Condition | Action |
|---|-----------|--------|
| 1 | ADOPT row total < 4,562 | HALT — data loss detected |
| 2 | FK orphans > 0 | HALT — constraint violation |
| 3 | gda-backend not healthy | HALT — backend issue |
| 4 | Any writer workflow inactive | HALT — Step 3 resume failure |
| 5 | Any writer workflow currently running | WAIT until completed, then proceed |
| 6 | Password cannot be retrieved from .env | HALT — cannot repoint credential |
| 7 | VPS repo not on expected SHA or dirty | HALT — clean before proceeding |

---

## 2. Scope — Exactly What Is Repointed

### 2a. The credential

| ID | Name | Type | Current Host | Target Host |
|----|------|------|-------------|-------------|
| HwronxMmGY5XDGEt | GDA Postgres | postgres | n8n-envision-postgres-1 | gda-postgres |

This is a **shared credential** used by **122 workflows** (121 active, 1 inactive).
Changing it repoints ALL 122 workflows in a single atomic operation.

### 2b. The 17 writer workflows (from Step 3 inventory)

All 17 use **only** HwronxMmGY5XDGEt. No workflow uses a second Postgres credential.

| # | Workflow | ID | Tables Written |
|---|----------|----|---------------|
| 1 | GDA.cron.auto-risk-generation | ldVAxgDGuKJx4354 | gda_risk_register |
| 2 | GDA.cron.deadline-escalation | Qg55lRKjubgsvD28 | gda_risk_register |
| 3 | GDA.cron.pipeline-health-digest | 9annZcPoqw0DaPKI | gda_risk_register |
| 4 | GDA.sched.opp-refresh | PeLGDqgLAsEh5Gsd | gda_opportunity_tracker |
| 5 | GDA.cron.broad-opp-search | BQFYbILTezLgqkDY | gda_opportunity_tracker |
| 6 | GDA.cron.capture-opp-sync | 0E3lCtWt2rdJlMPY | gda_opportunity_tracker |
| 7 | GDA.cron.fast-track-ingest | MJapg8dGkvEzLn0K | ft_signal_source, ft_opportunity_signal |
| 8 | GDA.cron.data-sync | M0xPvRs31zQOewfx | daily_trends, gda_trend_arrays, gda_learned_weights |
| 9 | GDA.cron.auto-capture-plan | 7gERqvfD6THg1gWf | gda_capture_plans |
| 10 | GDA.cron.comp-intel-daily-growth | EcZWryEoS4zyAfGD | gda_competitor_cache, gda_competitor_watchlist |
| 11 | GDA.api.comp-intel 2 | geW4zw6lvkkizF82 | gda_competitor_cache, gda_competitor_watchlist |
| 12 | GDA.cron.auto-opp-analysis | IGw8FBZhZwnwiIe1 | gda_intelligence_log, gda_action_items |
| 13 | GDA.cron.change-detector | Zb2quk78c5mszZ2C | gda_opportunity_alerts, opportunity_alerts |
| 14 | GDA.cron.health-scan-daily | gMEwjeBZbC4GzL3N | gda_error_log |
| 15 | GDA.api.intel-feed | KIT8cj4V2cMFdSkA | gda_dashboard_intel_cache, gda_morning_briefings |
| 16 | GDA.cron.stage-auto-promote | lU2uQfmQ6sch69TA | gda_opportunity_tracker |
| 17 | GDA.cron.daily-trends-collect | D6nZ235hSF4wGMb5 | daily_trends |

### 2c. The 105 reader/other workflows

The remaining 105 workflows use HwronxMmGY5XDGEt for **read-only** queries (SELECT via
`executeQuery` operation). These include all `GDA.api.*` endpoint workflows, dashboard
workflows, search workflows, and automation triggers. A full list by category:

**API/webhook workflows (69):** GDA.api.action-history, GDA.api.action-items 2,
GDA.api.agentic-chat, GDA.api.ai-feedback, GDA.api.aop-tracker,
GDA.api.approvals-queue, GDA.api.bd-activity-log, GDA.api.black-hat,
GDA.api.capture-hub, GDA.api.capture-intel, GDA.api.capture-intel-modules,
GDA.api.capture-plan, GDA.api.chat-simple, GDA.api.clause-library,
GDA.api.competitor-field, GDA.api.competitor-threat-score,
GDA.api.competitor-watchlist, GDA.api.compliance-matrix, GDA.api.contacts,
GDA.api.contracts, GDA.api.daily-actions, GDA.api.daily-brief,
GDA.api.daily-brief-reader, GDA.api.dashboard-intel 2, GDA.api.dashboard-mega,
GDA.api.data-learn, GDA.api.deep-research-history, GDA.api.discussions,
GDA.api.e2e-reports, GDA.api.email-drafter, GDA.api.embed-and-store,
GDA.api.error-log, GDA.api.export-excel, GDA.api.fast-track-needs (inactive),
GDA.api.govtribe-cache, GDA.api.health-scan, GDA.api.idiq-tracker,
GDA.api.incumbent-analysis, GDA.api.knowledge-base, GDA.api.launchpad,
GDA.api.launchpad-funnel, GDA.api.meeting-notes 2, GDA.api.morning-briefing,
GDA.api.naics 2, GDA.api.ndaa-far-ingest, GDA.api.ooda-loop 2,
GDA.api.opp-search, GDA.api.opp-tracker 2, GDA.api.opportunity-detail,
GDA.api.pipeline, GDA.api.platform-health, GDA.api.predictive-intel,
GDA.api.proactive-scan, GDA.api.proposals, GDA.api.pwin-calculator,
GDA.api.relationship-tracker, GDA.api.risk-intel, GDA.api.save-opp,
GDA.api.saved-opps, GDA.api.semantic-search, GDA.api.sitrep 2,
GDA.api.teaming-finder, GDA.api.teaming-scorer, GDA.api.trends,
GDA.api.vehicle-tracker, GDA.api.wargame, GDA.api.win-loss-db,
GDA.sub.dashboard-intel-deep, GDA.form.quick-entry

**Cron/scheduled workflows (26):** GDA.cron.amendment-monitor,
GDA.cron.auto-index-docs, GDA.cron.capture-gate-review,
GDA.cron.capture-milestone-alerts, GDA.cron.competitor-crawler,
GDA.cron.data-retention, GDA.cron.fpds-enrichment,
GDA.cron.idiq-task-order-alert, GDA.cron.learning-engine,
GDA.cron.master-scanner, GDA.cron.morning-intel-briefing,
GDA.cron.ndaa-ingest, GDA.cron.nightly-fy-revenue-calc,
GDA.cron.nightly-perplexity-research, GDA.cron.on-ramp-scanner,
GDA.cron.pipeline-coverage-check, GDA.cron.pwin-daily-loop,
GDA.cron.recompete-early-warning, GDA.cron.system-watchdog,
GDA.cron.weekly-comp-scan, GDA.cron.win-rate-weekly-digest,
GDA.sched.dept-market-refresh, GDA.sched.dept-opp-sweep,
GDA.sched.dhs-industry-day-monitor, GDA.sched.dpc-forecast-scraper,
GDA.sched.idiq-to-monitor

**Agent/auto/other (10):** GDA.agent.opp-classifier, GDA.auto.e2e-gemini-report,
GDA.auto.feedback-collector, GDA.bot.telegram-chat,
GDA.doctrine.pr-merge-draft, GDA.enrichment.capture-plan-cards,
GDA.error.handler, GDA.event.bidirectional-sync,
GDA.intel.an1-incumbent-win-themes, GDA.intel.morning-briefing-v1

> **Note:** GDA.cron.system-watchdog (LPUSYd4Vpph1Qg7n) uses HwronxMmGY5XDGEt for
> its DB health-check queries. It will be affected by the cutover but is NOT paused —
> see Section 6.

### 2d. Credential exclusion confirmation

| Credential | ID | Status |
|-----------|-----|--------|
| yK1VVsSN3tn0baVm | Postgres account | **NOT affected.** 0 workflows reference it. |

---

## 3. Approach — Credential Repoint (Recommended: Option A — Edit in Place)

### Option A: Edit HwronxMmGY5XDGEt in place ✅ RECOMMENDED

**What:** Change the `host` field from `n8n-envision-postgres-1` to `gda-postgres` in the
existing credential via the **n8n UI**. Also update `database` from `n8n` to `gda_command`,
`user` from `n8n` to `gda`, and `password` to the gda user's password (from compose env).

**Pros:**
- Atomic: one change, all 122 workflows repointed instantly
- Zero workflow JSON modifications required
- No ambiguous intermediate state (some workflows on old, some on new)
- Simple rollback: re-edit the same 4 fields back to original values
- n8n UI has built-in connection test — validates before saving

**Cons:**
- No n8n UI "undo" — rollback requires re-editing the credential
- Affects all 122 workflows simultaneously (but this is also a pro — no split-brain)

### Option B: Duplicate and swap ❌ NOT RECOMMENDED

**What:** Create a new credential "GDA Postgres (gda_command)" pointing at gda-postgres,
then update each workflow's node to reference the new credential.

**Cons:**
- 122 workflow JSON edits required (one per workflow)
- Risk of partial state: some workflows on old credential, some on new
- n8n API v1 uses PUT for workflow updates — must send full workflow body
- Much more opportunity for mistakes

### Recommendation

**Option A.** It leaves fewer variables moving: one credential edit vs 122 workflow edits.
The rollback path (re-edit the credential) is equally simple. Reproducibility is achieved
through the audit doc (exact field values captured before and after), not a script.

### Credential field changes

| Field | Before | After |
|-------|--------|-------|
| host | n8n-envision-postgres-1 | gda-postgres |
| port | 5432 | 5432 |
| database | n8n | gda_command |
| user | n8n | gda |
| password | *(n8n user password)* | *(gda password from compose env — do NOT commit)* |
| ssl | false | false |

> **IMPORTANT:** The credential data in n8n is encrypted. The edit must be done through
> the n8n UI (Settings → Credentials → GDA Postgres → Edit). Direct SQL UPDATE on
> `credentials_entity.data` will NOT work because the payload is AES-encrypted.

---

## 4. Connectivity Pre-Flight

### 4a. Network topology

```
n8n-envision-n8n-1:
  - n8n-envision_envision-internal: 172.20.0.3
  - n8n_default: 172.18.0.4

gda-postgres:
  - gda-command-v2_gda: 172.22.0.2
  - n8n_default: 172.18.0.7

Shared network: n8n_default
DNS: "gda-postgres" resolves from n8n container via Docker embedded DNS
```

**Verified:** `docker exec n8n-envision-n8n-1 nc -z -w5 gda-postgres 5432` → REACHABLE.

### 4b. Authentication

```
pg_hba.conf on gda-postgres:
  host all all all scram-sha-256
```

The n8n container's IP (172.18.0.4) is within the `all` range.

### 4c. Grants

The `gda` user is the **owner** of all 28 ADOPT tables (verified via `pg_tables.tableowner`).
Full privileges: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER.

### 4d. Non-ADOPT table access

> **See Section 0 for the critical finding.** 30 tables referenced by workflows exist on
> n8n DB only and do NOT exist on gda_command. This must be resolved before execution.

### 4e. Pre-flight verification command

```bash
# From gda-postgres, verify auth works
docker exec gda-postgres psql -U gda -d gda_command -c \
  'SELECT count(*) FROM gda_opportunity_tracker;'
# Expect: >= 1780
```

---

## 5. Backend Restart Plan

### 5a. Current state

| Item | Value |
|------|-------|
| Image | gda-command-v2-backend:latest |
| Image ID | sha256:1b8ca37f1e5651184c0f22e031e79d50d2d8710152750eef773756e6c86dcdbf |
| Image built | 2026-05-20 15:01:38 UTC |
| Container created | 2026-05-21T17:38:13Z |
| Code version | Pre-PR#288 (does not include migrations 057-084 code) |
| Restart policy | unless-stopped |

The backend needs to be **rebuilt** (not just restarted) to pick up main since PR #288.
A simple `docker restart gda-backend` would restart the same old image. We need
`docker compose build backend && docker compose up -d backend`.

### 5b. Restart timing: AFTER credential cutover

**Recommended order:** Pause → Backup → Credential repoint → Watchdog canary → Backend rebuild → Resume.

Rationale:
- The credential repoint is the critical cutover. Doing it while workflows are paused
  means no workflow tries to connect to the wrong DB during the transition.
- The backend rebuild happens while workflows are still paused — if the build fails, we
  can still revert the credential without any workflow having tried to use the new target.
- The backend reads from gda_command (always has). After the credential cutover, n8n
  workflows will ALSO read/write to gda_command. There's no conflict between the backend
  restart and the credential change — they're independent axes.

**If backend rebuild fails:** Revert credential AND skip workflow resume. This leaves prod
in pre-change state with writers paused — the lowest-risk rollback target. Do not resume
workflows against the new credential with a broken backend.

### 5c. Downtime expectation

- **Backend build:** 30-60 seconds (TypeScript compile + Docker image build)
- **Backend startup:** 5-10 seconds (Express server + migration check)
- **Total downtime on gda.csr-llc.tech:** ~45-90 seconds
- During this window, the frontend will show "Backend Unavailable" but n8n is unaffected.

### 5d. Health check sequence (post-restart)

```bash
# 1. Container is running and healthy
docker ps --filter name=gda-backend --format "{{.Names}} {{.Status}}"
# Expect: "gda-backend Up X seconds (healthy)"

# 2. HTTP health endpoint
curl -s https://gda.csr-llc.tech/health | python3 -c "
import sys,json; d=json.load(sys.stdin); print('status:', d['data']['status'])"
# Expect: "status: ok"

# 3. Migration runner did NOT re-apply anything (all 88 already in schema_migrations)
docker logs gda-backend --tail 50 2>&1 | grep -i "migration"
# Expect: "All migrations already applied" or "0 new migrations"

# 4. Verify schema_migrations still = 88
docker exec gda-postgres psql -U gda -d gda_command -t -c "SELECT count(*) FROM schema_migrations;"
# Expect: 88
```

### 5e. Rollback if backend fails to start

```bash
# The old image is still cached locally
docker images gda-command-v2-backend --format "{{.ID}} {{.CreatedAt}}"
# Identify the previous image (sha256:1b8ca37f1e56...)

# Rollback: check out pre-PR#288 code and rebuild
cd /root/gda-command-v2
git stash  # or git checkout <old-commit>
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

---

## 6. Workflow Pause/Resume

Same 17 writer workflows as Step 3 (docs/audits/f026-step3-writer-workflows-20260522.md).

### 6a. Pause list

| # | Workflow | ID | Action |
|---|----------|----|--------|
| 1 | GDA.cron.auto-risk-generation | ldVAxgDGuKJx4354 | PAUSE |
| 2 | GDA.cron.deadline-escalation | Qg55lRKjubgsvD28 | PAUSE |
| 3 | GDA.cron.pipeline-health-digest | 9annZcPoqw0DaPKI | PAUSE |
| 4 | GDA.sched.opp-refresh | PeLGDqgLAsEh5Gsd | PAUSE |
| 5 | GDA.cron.broad-opp-search | BQFYbILTezLgqkDY | PAUSE |
| 6 | GDA.cron.capture-opp-sync | 0E3lCtWt2rdJlMPY | PAUSE |
| 7 | GDA.cron.fast-track-ingest | MJapg8dGkvEzLn0K | PAUSE |
| 8 | GDA.cron.data-sync | M0xPvRs31zQOewfx | PAUSE |
| 9 | GDA.cron.auto-capture-plan | 7gERqvfD6THg1gWf | PAUSE |
| 10 | GDA.cron.comp-intel-daily-growth | EcZWryEoS4zyAfGD | PAUSE |
| 11 | GDA.api.comp-intel 2 | geW4zw6lvkkizF82 | PAUSE |
| 12 | GDA.cron.auto-opp-analysis | IGw8FBZhZwnwiIe1 | PAUSE |
| 13 | GDA.cron.change-detector | Zb2quk78c5mszZ2C | PAUSE |
| 14 | GDA.cron.health-scan-daily | gMEwjeBZbC4GzL3N | PAUSE |
| 15 | GDA.api.intel-feed | KIT8cj4V2cMFdSkA | PAUSE |
| 16 | GDA.cron.stage-auto-promote | lU2uQfmQ6sch69TA | PAUSE |
| 17 | GDA.cron.daily-trends-collect | D6nZ235hSF4wGMb5 | PAUSE |

- **GDA.cron.system-watchdog (LPUSYd4Vpph1Qg7n):** NOT paused. Stays running as canary.
  It uses HwronxMmGY5XDGEt, so it will experience the credential cutover live. If it
  fails, that's an immediate signal to roll back.
- **GDA.cron.change-detector (Zb2quk78c5mszZ2C):** PAUSED as #13. It's a writer.

### 6b. API method

```bash
# Pause: POST /api/v1/workflows/{id}/deactivate
# Resume: POST /api/v1/workflows/{id}/activate
# (PATCH is 405 on this n8n version — 2.21.5)
```

### 6c. Pause/resume verification

```bash
# After pause: expect 140 active (157 - 17)
curl -s "$N8N_API/workflows?active=true&limit=200" -H "X-N8N-API-KEY: $API_KEY" | \
  python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))"

# After resume: expect 157 active
```

---

## 7. Execution Order

### Phase A: Pause writer workflows + capture source DB baseline

1. Verify preconditions (Section 1)
2. Capture pre-cutover active count (expect 157)
3. **Capture n8n DB ADOPT table row counts (baseline for freeze test — Section 8d)**
4. Pause 17 writers via `POST /deactivate`
5. Verify active count = 140
6. Wait 30 seconds for any in-flight executions to drain

### Phase B: Backup gda_command

```bash
/root/backup-before-migration.sh gda_command
```

This captures the post-Step-3 state as the rollback target.

### Phase C: Repoint credential

Edit HwronxMmGY5XDGEt via n8n UI:
1. Navigate to n8n.csr-llc.tech → Settings → Credentials → "GDA Postgres"
2. Change `host` from `n8n-envision-postgres-1` to `gda-postgres`
3. Change `database` from `n8n` to `gda_command`
4. Change `user` from `n8n` to `gda`
5. Change `password` to gda user's password (from compose env)
6. Save
7. Use n8n's built-in "Test" button to verify the credential connects

### Phase C.5: Manual watchdog trigger (immediate canary)

Immediately after credential save, manually trigger system-watchdog to verify
the new credential works. Do NOT wait for the next scheduled run (up to 10 min).

```bash
# Trigger watchdog manually
curl -s -X POST "$N8N_API/workflows/LPUSYd4Vpph1Qg7n/execute" \
  -H "X-N8N-API-KEY: $API_KEY" \
  -H "Content-Type: application/json" -d '{}'

# Wait 10 seconds for execution to complete, then check result
sleep 10
curl -s "$N8N_API/executions?workflowId=LPUSYd4Vpph1Qg7n&limit=1" \
  -H "X-N8N-API-KEY: $API_KEY" | python3 -c "
import sys,json; d=json.load(sys.stdin)['data'][0]; \
print(f'Status: {d[\"status\"]}  Finished: {d.get(\"stoppedAt\",\"running\")}')"
# Expect: Status: success
# If status = "error" → HALT IMMEDIATELY. Revert credential before any other step.
```

### Phase D: Restart gda-backend

```bash
cd /root/gda-command-v2

# Pre-build verification
git log --oneline -1
# Expect: post-PR#297 SHA (64d2fad)
git status
# Expect: clean working tree
# HALT if either fails

git pull origin main
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

Wait for health check (Section 5d). HALT if backend doesn't come up healthy within 60
seconds. **If backend fails: revert credential AND skip workflow resume** (Section 5b).

### Phase E: Resume writer workflows

1. Resume 17 writers via `POST /activate` (same order as paused)
2. Verify active count = 157

### Phase F: Verification window

See Section 8.

---

## 8. Verification

### 8a. First-cycle monitoring (after resume)

For each of the 17 writer workflows, wait for one full execution cycle and verify:

```bash
# For each writer, get the first post-resume execution
curl -s "$N8N_API/executions?workflowId={ID}&limit=1" -H "X-N8N-API-KEY: $API_KEY"
# Verify: status = "success", no DB-related errors in the execution data
```

### 8b. Write target verification

Confirm writes land in gda-postgres/gda_command (not n8n-envision-postgres-1):

```bash
# Capture row counts on gda_command ADOPT tables
# Compare to pre-cutover counts — expect increase for active writer tables

# Capture row counts on n8n-envision-postgres-1 ADOPT tables
# Compare to pre-cutover counts — expect NO change (frozen)
# This is the critical test: if old DB counts increase, the cutover didn't work
```

### 8c. Spot-check records

Select 3+ specific records from gda_command and verify they match expected data:

```bash
# Example: latest gda_risk_register entry
docker exec gda-postgres psql -U gda -d gda_command -c "
SELECT id, title, status, updated_at FROM gda_risk_register ORDER BY updated_at DESC LIMIT 3;"

# Example: latest daily_trends entry
docker exec gda-postgres psql -U gda -d gda_command -c "
SELECT id, trend_date, updated_at FROM daily_trends ORDER BY updated_at DESC LIMIT 3;"
```

### 8d. Source DB freeze verification (strengthened)

Capture n8n DB ADOPT table counts at **Phase A (pre-pause)** and again at **Phase F
(post-verification)**. Both snapshots must be EXACTLY equal. Any delta (up OR down) is
a HALT.

```bash
# Capture ALL 28 ADOPT table counts on n8n-envision-postgres-1
for t in gda_relationships ft_signal_source gda_touchpoints ft_opportunity_signal \
  gda_risk_register gda_opportunity_tracker gda_capture_plans gda_intelligence_log \
  gda_competitor_watchlist opportunity_alerts gda_competitor_cache gda_action_items \
  gda_active_contracts gda_dashboard_intel_cache daily_trends gda_opportunity_alerts \
  gda_morning_briefings gda_learned_weights gda_win_loss gda_error_log \
  gda_saved_opportunities gda_teaming_partners gda_embeddings govtribe_cache \
  gda_wargames gda_win_loss_db gda_trend_arrays gda_contacts; do
  echo -n "$t: "
  docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -t -c "SELECT count(*) FROM $t;" | tr -d ' '
done
# Compare Phase A counts to Phase F counts — must be IDENTICAL.
# If any count increased → HALT: writes still going to old DB.
# If any count decreased → HALT: unexpected data deletion on old DB.
```

### 8e. Endpoint health

```bash
curl -s -o /dev/null -w "%{http_code}" https://gda.csr-llc.tech/health        # Expect: 200
curl -s -o /dev/null -w "%{http_code}" https://n8n.csr-llc.tech/healthz       # Expect: 200
curl -s -o /dev/null -w "HTTP %{http_code}" -X POST https://mcp.csr-llc.tech/mcp \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"health-check","version":"1.0"}},"id":1}'
# Expect: 200
```

### 8f. Canary verification (15-minute wait)

After resume, wait 15 minutes and verify:

| Canary | Cadence | Expected |
|--------|---------|----------|
| GDA.cron.change-detector (Zb2quk78c5mszZ2C) | 5 min | ≥ 3 successful runs post-resume |
| GDA.cron.system-watchdog (LPUSYd4Vpph1Qg7n) | 10 min | ≥ 1 successful run post-cutover (it was never paused) |

---

## 9. Halt Conditions

| # | Condition | Phase | Action |
|---|-----------|-------|--------|
| 1 | Precondition check fails (Section 1) | Pre-exec | HALT — do not proceed |
| 2 | Connectivity pre-flight fails | Pre-exec | HALT — fix network/DNS before proceeding |
| 3 | Any auth/grant failure on gda-postgres | Pre-exec | HALT — add grants before proceeding |
| 4 | Backup script returns non-zero | Phase B | HALT — no rollback target |
| 5 | Manual watchdog trigger fails (Phase C.5) | Phase C.5 | HALT — revert credential immediately |
| 6 | Backend build fails | Phase D | HALT — revert credential AND skip resume |
| 7 | Backend health check fails within 60s | Phase D | HALT — revert credential AND revert backend |
| 8 | schema_migrations count != 88 after restart | Phase D | HALT — migration runner corrupted state |
| 9 | Any writer workflow's first post-resume run shows ANY non-success status, OR completes successfully but writes 0 rows when prior cycles consistently wrote N>0 rows | Phase F | HALT — revert credential (catches silent failures: auth succeeded but writes silently dropped or routed wrong) |
| 10 | n8n DB ADOPT table counts changed between Phase A and Phase F (any delta, up or down) | Phase F | HALT — writes still going to old DB or unexpected deletion |
| 11 | Active workflow count != 157 after resume | Phase E | HALT — workflows didn't resume |
| 12 | Any endpoint returns non-200 | Phase F | HALT — investigate before declaring complete |
| 13 | Canary workflows don't fire within 15 min | Phase F | HALT — scheduling broken |
| 14 | Password not retrievable from .env | Pre-exec | HALT — cannot repoint credential |
| 15 | VPS repo not on expected SHA or dirty | Pre-exec | HALT — clean before proceeding |

---

## 10. Rollback

### 10a. Credential revert (primary rollback)

If the credential repoint is wrong or causes errors:

```
Edit HwronxMmGY5XDGEt in n8n UI:
  host: gda-postgres → n8n-envision-postgres-1
  database: gda_command → n8n
  user: gda → n8n
  password: <gda password> → <n8n password>
```

This instantly reverts all 122 workflows to the old DB. Takes ~30 seconds via UI.

### 10b. Backend revert

If the rebuilt backend fails:

```bash
cd /root/gda-command-v2
git stash  # or git checkout <old-commit>
docker compose -f docker-compose.prod.yml build backend
docker compose -f docker-compose.prod.yml up -d backend
```

### 10c. Data restore

If data drift is detected (writes went to wrong place, data corruption):

```bash
# Restore gda_command from the Phase B backup (selective, per-table, each in its own transaction)
for TABLE in gda_risk_register gda_opportunity_tracker gda_capture_plans \
  gda_intelligence_log gda_competitor_watchlist opportunity_alerts \
  gda_competitor_cache gda_action_items gda_active_contracts \
  gda_dashboard_intel_cache daily_trends gda_opportunity_alerts \
  gda_morning_briefings gda_learned_weights gda_win_loss gda_error_log \
  gda_saved_opportunities gda_teaming_partners gda_embeddings govtribe_cache \
  gda_wargames gda_win_loss_db gda_trend_arrays gda_contacts \
  gda_relationships ft_signal_source gda_touchpoints ft_opportunity_signal; do
  pg_restore --host=localhost --port=5432 --username=gda --dbname=gda_command \
    --table="$TABLE" --single-transaction --clean --if-exists --no-owner \
    /root/backups/gda_command_<timestamp>.dump
done
```

> **WARNING:** Do NOT use `--clean` against the full DB. Selective per-table restore only.
> Each table restored in `--single-transaction` so a failure rolls back only that table.
> The 86 production application tables must NEVER be touched by rollback.

### 10d. Recovery matrix

| Failure | Recoverable in-place? | Human intervention needed? |
|---------|----------------------|---------------------------|
| Credential wrong (auth error) | Yes — re-edit credential | No |
| Credential right but data goes to wrong DB | Yes — re-edit credential | Check for split writes |
| Backend build fails | Yes — revert credential + old image | No |
| Backend starts but migrations re-apply | Investigate — may be fine | Maybe — check what ran |
| Data corruption on ADOPT tables | Yes — per-table restore from backup | Review what caused it |
| n8n container crash | Restart n8n container | No |
| Both credential and backend fail | Revert both independently | Architect should review |

---

## 11. Deliberate Non-Goals

1. **Step 4 does NOT drop tables from n8n-envision-postgres-1.** That's Step 5. The shadow
   tables remain as a fallback until Step 5 explicitly removes them.

2. **Step 4 does NOT modify any workflow JSON.** Only the credential pointer changes. No
   workflow node configurations, trigger settings, or execution logic is altered.

3. **Step 4 does NOT touch yK1VVsSN3tn0baVm** ("Postgres account") or any other non-GDA
   credential. That credential has 0 workflow references and is completely out of scope.

4. **Step 4 does NOT modify the n8n `n8n` database.** The credential edit is stored in
   n8n's `credentials_entity` table on n8n-envision-postgres-1, which is an n8n-internal
   table — but this is a normal n8n operation (updating a credential), not a direct DB
   modification.

5. **Step 4 does NOT include Compose drift reconciliation** (F-037). The backend restart
   uses the existing compose file as-is.

---

## 12. Resolved Questions

### 12a. Credential edit method — RESOLVED: UI edit

Per architect: use the native n8n UI path. It has a built-in connection test and is
well-tested. Reproducibility comes through the audit doc (capture exact field values
changed), not a script.

### 12b. gda user password — RESOLVED: from compose env

Pull `POSTGRES_PASSWORD` from `/root/gda-command-v2/.env` or the compose env reference.
Do NOT include the password value in any committed file or PR description. Reference as
"gda password from compose env" only. If the password cannot be retrieved, that is a
HALT condition (Section 1e).

### 12c. Non-ADOPT table existence — ELEVATED to Section 0

See Section 0. **30 tables exist on n8n DB only.** This is a blocking issue that must be
resolved before Step 4 execution. The original Section 4d assumption ("the 86 application
tables live on gda-postgres") was partially wrong — the 122 workflows currently query the
n8n DB for everything, including these 30 non-ADOPT shadow tables that have no counterpart
on gda_command.

### 12d. system-watchdog as live canary — RESOLVED: keep running + manual trigger

Per architect: keep system-watchdog running as canary. Add a manual trigger immediately
after credential edit (Phase C.5) via `POST /workflows/LPUSYd4Vpph1Qg7n/execute`. If the
manual trigger fails, immediately revert credential. This shortens the blind window from
~10 min to seconds.

### 12e. Backend rebuild scope — RESOLVED: verify SHA + clean tree

Before build: require BOTH `git log --oneline -1` matches the expected post-#297 SHA AND
`git status` shows clean working tree on the VPS. Document both checks in the PR. Added
as Section 1f precondition.
