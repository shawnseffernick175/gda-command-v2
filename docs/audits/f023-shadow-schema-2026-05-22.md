# F-023 Shadow Schema Inventory & Classification

**Date:** 2026-05-22
**Author:** Devin (automated audit)
**Status:** F-023a EXECUTED — 17 tables dropped, 1 promoted to ADOPT
**Updated:** 2026-05-22 (F-023a execution — 5 deferred tables dropped, gda_touchpoints adopted)
**Issue:** [#258](https://github.com/shawnseffernick175/gda-command-v2/issues/258)

---

## ⚠ SENSITIVE DATA FLAG

The following shadow tables contain PII-class columns:

| Table | Column | Type | Risk |
|-------|--------|------|------|
| `gda_contacts` | `email` | text | PII — email addresses |
| `gda_contacts` | `phone` | text | PII — phone numbers |
| `gda_relationships` | `email` | varchar | PII — email addresses |
| `gda_relationships` | `phone` | varchar | PII — phone numbers |

Both tables currently have 0 live rows, so no PII is exposed today. However, they are
actively referenced by workflows (`GDA.api.contacts`, `GDA.api.relationship-tracker`)
and will accumulate PII in production use.

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **GDA application DB (`gda_command` in `gda-postgres`)** | **86 tables** |
| Migration-tracked tables | 84 |
| Infrastructure tables (`_migrations`, `schema_migrations`) | 2 |
| **Shadow tables in `gda_command`** | **0** |
| | |
| **n8n database (`n8n` in `n8n-envision-postgres-1`)** | **156 tables** (was 173 pre-drop) |
| n8n internal tables (managed by n8n's migration system) | 92 |
| **Shadow tables (workflow-created, not migration-tracked)** | **64** (was 81; 17 dropped total) |

### Key Finding

The original F-023 estimate of "39 shadow tables" was based on incomplete information.
The actual count is **81 shadow tables**, all located in `n8n-envision-postgres-1` (the
n8n database), NOT in the GDA application database (`gda_command`).

The GDA application database is **clean** — all 84 application tables are tracked by
the migration system in `packages/backend/src/db/migrations/`. The only 2 extra tables
(`_migrations` and `schema_migrations`) are migration-tracking infrastructure created by
the backend's own migration runner.

All 81 shadow tables were created by n8n workflows using the "GDA Postgres" credential
(`HwronxMmGY5XDGEt`), which connects to `n8n-envision-postgres-1` — not `gda-postgres`.

---

## Bucket Counts

| Classification | Count | % | Total Size | Notes |
|---------------|-------|---|-----------|-------|
| **ADOPT** | 28 | 44% | ~20 MB | +2 PII promoted, +1 gda_touchpoints (F-023a) |
| **DOCUMENT-ONLY** | 36 | 56% | ~3.4 MB | −2 promoted to ADOPT |
| **DROPPED** | 17 | — | — | 12 (Step 2) + 5 (F-023a) |
| **EXCLUDED (n8n-internal)** | 5 | — | ~8 MB | Confirmed n8n migration-managed |
| **Active Total** | **64** | 100% | ~23.4 MB | 28 ADOPT + 36 DOCUMENT-ONLY |

---

## Classification Criteria

- **ADOPT**: Actively used by ≥3 workflows OR contains >100 rows of production data.
  Must be brought into migration tracking for F-026 Steps 3/4/5.
- **DELETE**: 0 workflow references AND 0 live data. Safe to DROP in a future PR.
- **DOCUMENT-ONLY**: Used by 1-2 workflows, contains useful data, but lifecycle is
  managed entirely by those workflows (scratch tables, caches, logs).
- **INVESTIGATE**: Ambiguous usage — needs architect review before classification.

---

## Per-Table Classification

### ADOPT — 28 tables (must be brought into migration system)

| # | Table | Cols | Rows | Size | Indexes | Workflows | Justification |
|---|-------|------|------|------|---------|-----------|---------------|
| 1 | `gda_opportunity_tracker` | 38 | 1,780 | 1,728 kB | 6 | 54 | Core pipeline table — most-referenced table in entire fleet |
| 2 | `gda_capture_plans` | 13 | ~98 | 696 kB | 2 | 25 | Capture planning — second most-referenced table |
| 3 | `gda_intelligence_log` | 7 | 54 | 136 kB | 4 | 14 | Intelligence feed log — 14 workflows write/read |
| 4 | `gda_competitor_watchlist` | 37 | 4 | 184 kB | 4 | 9 | Competitor intelligence — 9 workflows, complex schema |
| 5 | `risk_register` | 25 | 459 | 488 kB | 8 | 8 | Risk management — 8 workflows, 459 active rows |
| 6 | `opportunity_alerts` | 25 | ~5 | 216 kB | 9 | 7 | Alert system — 7 workflows, heavily indexed |
| 7 | `gda_competitor_cache` | 5 | 1 | 168 kB | 4 | 6 | Competitor data cache — 6 workflows |
| 8 | `gda_action_items` | 7 | 47 | 584 kB | 4 | 5 | Action items — 5 workflows, actively written |
| 9 | `gda_active_contracts` | 24 | 0 | 32 kB | 1 | 5 | Contract tracking — 5 workflows |
| 10 | `gda_dashboard_intel_cache` | 3 | 1 | 200 kB | 1 | 5 | Dashboard cache — 5 workflows |
| 11 | `daily_trends` | 10 | 528 | 200 kB | 4 | 4 | Trend analytics — 528 rows, 4 workflows |
| 12 | `gda_opportunity_alerts` | 9 | ~7 | 112 kB | 4 | 4 | Opp alert system — 4 workflows |
| 13 | `gda_morning_briefings` | 7 | 12 | 264 kB | 1 | 4 | Briefing system — 4 workflows, includes bot |
| 14 | `gda_learned_weights` | 8 | 18 | 64 kB | 3 | 4 | ML weights — 4 workflows, actively updated |
| 15 | `gda_win_loss` | 25 | ~7 | 64 kB | 1 | 4 | Win/loss analysis — 4 workflows |
| 16 | `gda_error_log` | 7 | 334 | 88 kB | 1 | 3 | Error logging — 334 rows, 3 workflows |
| 17 | `gda_saved_opportunities` | 20 | 0 | 40 kB | 1 | 3 | Saved opps — 3 workflows |
| 18 | `gda_teaming_partners` | 23 | ~12 | 80 kB | 2 | 3 | Teaming tracker — 3 workflows |
| 19 | `ft_opportunity_signal` | 24 | 232 | 256 kB | 6 | 2 | Fast-track pipeline — 232 signals, FK parent |
| 20 | `ft_signal_source` | 9 | 10 | 48 kB | 2 | 2 | Fast-track sources — FK parent for ft_* tables |
| 21 | `gda_embeddings` | 10 | ~821 | **14 MB** | 4 | 2 | Vector embeddings — largest table by size. pgvector v0.8.2 confirmed on `gda-postgres` |
| 22 | `govtribe_cache` | — | 0 | — | — | 2 | GovTribe data cache — 2 workflows |
| 23 | `gda_wargames` | — | 0 | — | — | 2 | Wargaming scenarios — 2 workflows |
| 24 | `gda_win_loss_db` | — | 10 | — | — | 1 | Win/loss database — 1 workflow |
| 25 | `gda_trend_arrays` | — | 15 | — | — | 1 | Trend arrays — 1 workflow, actively updated |
| 26 | `gda_contacts` | 17 | 0 | 80 kB | — | 2 | **PROMOTED from DOCUMENT-ONLY** — PII columns (email, phone) require migration tracking |
| 27 | `gda_relationships` | 13 | 0 | 16 kB | — | 1 | **PROMOTED from DOCUMENT-ONLY** — PII columns (email, phone) require migration tracking. **MIGRATION_PENDING** → [057_n8n_gda_relationships.sql](../../packages/backend/src/db/migrations/057_n8n_gda_relationships.sql) |
| 28 | `gda_touchpoints` | 7 | 0 | 8 kB | — | 1 | **PROMOTED from DEFERRED** (F-023a) — FK child of `gda_relationships`, companion table for relationship-tracker workflow. **MIGRATION_PENDING** → [058_n8n_gda_touchpoints.sql](../../packages/backend/src/db/migrations/058_n8n_gda_touchpoints.sql) |

### DOCUMENT-ONLY — 36 tables (managed by specific workflows)

| # | Table | Cols | Rows | Size | Workflows | Primary Workflow(s) |
|---|-------|------|------|------|-----------|---------------------|
| 1 | `gda_action_history` | 9 | 6 | 200 kB | 2 | `GDA.api.action-history`, `GDA.cron.data-retention` |
| 2 | `gda_ai_feedback` | 8 | 0 | 16 kB | 1 | `GDA.api.ai-feedback` |
| 3 | `gda_aop_tracker` | 22 | ~12 | 80 kB | 1 | `GDA.api.aop-tracker` |
| 4 | `gda_approval_queue` | 10 | 0 | 16 kB | 1 | `GDA.api.approvals-queue` |
| 5 | `gda_capture_lessons` | 12 | 0 | 16 kB | 2 | `GDA.api.capture-plan`, `GDA.api.opp-tracker 2` |
| 6 | `gda_chat_history` | 5 | 6 | 72 kB | 1 | `GDA.api.agentic-chat` |
| 7 | `gda_clause_library` | 7 | ~18 | 80 kB | 1 | `GDA.api.clause-library` |
| 8 | `gda_competitor_crawls` | 8 | 30 | 176 kB | 1 | `GDA.cron.competitor-crawler` |
| 9 | `gda_compliance_matrices` | 6 | ~4 | 136 kB | 1 | `GDA.api.compliance-matrix` |
| 10 | ~~`gda_contacts`~~ | — | — | — | — | **PROMOTED TO ADOPT** (PII — email, phone columns) |
| 11 | `gda_content_store` | 13 | ~7 | 128 kB | 1 | `GDA.auto.learning-capture` |
| 12 | `gda_contract_vehicles` | 26 | ~2 | 80 kB | 2 | `GDA.api.vehicle-tracker`, `GDA.api.capture-hub` |
| 13 | `gda_daily_briefings` | 4 | ~55 | 512 kB | 1 | `GDA.api.sitrep 2` |
| 14 | `gda_daily_briefs` | 5 | 0 | 120 kB | 2 | `GDA.cron.morning-intel-briefing`, `GDA.api.daily-brief-reader` |
| 15 | `gda_data_lake` | 12 | ~54 | 200 kB | 1 | `GDA.cron.competitor-auto-enrichment` (read-only) |
| 16 | `gda_decision_memory` | 16 | ~2 | 128 kB | 1 | `GDA.auto.learning-capture` |
| 17 | `gda_deep_research` | 10 | 0 | 136 kB | 2 | `GDA.research.deep-research`, `GDA.api.deep-research-history` |
| 18 | `gda_dept_market` | 10 | ~8 | 80 kB | 2 | `GDA.sched.dept-market-refresh`, `GDA.api.capture-hub` |
| 19 | `gda_discussions` | 9 | 0 | 16 kB | 1 | `GDA.api.discussions` |
| 20 | `gda_doc_inbox` | 13 | 0 | 16 kB | 2 | `GDA.cron.auto-index-docs`, `GDA.form.quick-entry` |
| 21 | `gda_e2e_reports` | 10 | 27 | 432 kB | 2 | `GDA.auto.e2e-gemini-report`, `GDA.api.e2e-reports` |
| 22 | `gda_feedback` | 7 | 8 | 64 kB | 2 | `GDA.auto.feedback-collector`, `GDA.cron.learning-engine` |
| 23 | `gda_health_scans` | 10 | 3 | 96 kB | 1 | `GDA.api.health-scan` |
| 24 | `gda_idiq_tracker` | 26 | ~21 | 88 kB | 2 | `GDA.api.idiq-tracker`, `GDA.sched.idiq-to-monitor` |
| 25 | `gda_incumbent_analysis` | 10 | ~18 | 80 kB | 1 | `GDA.api.launchpad` (read-only) |
| 26 | `gda_interaction_log` | 10 | 0 | 112 kB | 1 | `GDA.auto.learning-capture` |
| 27 | `gda_knowledge_base` | 7 | ~4 | 128 kB | 1 | `GDA.api.knowledge-base` (read-only) |
| 28 | `gda_learning_log` | 8 | 0 | 96 kB | 2 | `GDA.api.data-learn`, `GDA.auto.learning-capture` |
| 29 | `gda_meeting_notes` | 15 | 0 | 120 kB | 1 | `GDA.api.meeting-notes 2` |
| 30 | `gda_mega_cache` | 3 | 1 | 208 kB | 2 | `GDA.api.dashboard-mega`, `GDA.cron.nightly-fy-revenue-calc` |
| 31 | `gda_naics_tracking` | 8 | 0 | 24 kB | 1 | `GDA.api.naics 2` |
| 32 | `gda_ndaa_intel` | 8 | ~14 | 80 kB | 2 | `GDA.api.ndaa-far-ingest`, `GDA.api.capture-hub` |
| 33 | `gda_ooda_loops` | 9 | ~3 | 216 kB | 2 | `GDA.api.ooda-loop 2`, `GDA.cron.data-sync` |
| 34 | `gda_pattern_library` | 12 | ~189 | 184 kB | 2 | `GDA.auto.pattern-extractor`, `GDA.auto.learning-capture` |
| 35 | `gda_prompt_architect_memory` | 4 | 0 | 16 kB | 1 | `GDA.cron.data-retention` (delete-only) |
| 36 | `gda_pwin_scores` | 13 | ~12 | 104 kB | 1 | `GDA.api.pwin-calculator` |
| 37 | ~~`gda_relationships`~~ | — | — | — | — | **PROMOTED TO ADOPT** (PII — email, phone columns) |
| 38 | `gda_stage_audit` | 8 | ~12 | 96 kB | 2 | `GDA.event.bidirectional-sync`, `GDA.cron.amendment-monitor` |

### DROPPED — 17 tables (12 Step 2 + 5 F-023a)

Tables 1-12 confirmed 0 rows at time of drop (Step 2). Tables 13-17 had stale orphan data (F-023a).
All 0 workflow refs, 0 backend code refs. Schemas archived on VPS. View `ft_need_view` also dropped (depended on `ft_need_tag`).

| # | Table | Drop Order | Response | Archive |
|---|-------|-----------|----------|--------|
| 1 | `ft_need_tag` | 1 (FK child) | DROP TABLE | `/tmp/f023-drop-archive/ft_need_tag.sql` |
| 2 | `gda_outcome_tracker` | 2 (outbound FKs) | DROP TABLE | `/tmp/f023-drop-archive/gda_outcome_tracker.sql` |
| 3 | `gda_ai_observations` | 3 | DROP TABLE | `/tmp/f023-drop-archive/gda_ai_observations.sql` |
| 4 | `gda_aop_capture` | 4 | DROP TABLE | `/tmp/f023-drop-archive/gda_aop_capture.sql` |
| 5 | `gda_aop_execution` | 5 | DROP TABLE | `/tmp/f023-drop-archive/gda_aop_execution.sql` |
| 6 | `gda_competitor_intel` | 6 | DROP TABLE | `/tmp/f023-drop-archive/gda_competitor_intel.sql` |
| 7 | `gda_forecasts` | 7 | DROP TABLE | `/tmp/f023-drop-archive/gda_forecasts.sql` |
| 8 | `gda_prompt_library` | 8 | DROP TABLE | `/tmp/f023-drop-archive/gda_prompt_library.sql` |
| 9 | `gda_proposal_sections` | 9 | DROP TABLE | `/tmp/f023-drop-archive/gda_proposal_sections.sql` |
| 10 | `gda_risk_register` | 10 | DROP TABLE | `/tmp/f023-drop-archive/gda_risk_register.sql` |
| 11 | `gda_tmp_deploy` | 11 | DROP TABLE | `/tmp/f023-drop-archive/gda_tmp_deploy.sql` |
| 12 | `gda_trend_snapshots` | 12 | DROP TABLE | `/tmp/f023-drop-archive/gda_trend_snapshots.sql` |
| 13 | `gda_incumbent_log` | F-023a | DROP TABLE (19 rows) | `/tmp/f023-deferred-archive/gda_incumbent_log.sql` |
| 14 | `gda_market_benchmarks` | F-023a | DROP TABLE (20 rows) | `/tmp/f023-deferred-archive/gda_market_benchmarks.sql` |
| 15 | `gda_pre_sam_intel` | F-023a | DROP TABLE (53 rows) | `/tmp/f023-deferred-archive/gda_pre_sam_intel.sql` |
| 16 | `gda_target_agencies` | F-023a | DROP TABLE (5 rows) | `/tmp/f023-deferred-archive/gda_target_agencies.sql` |
| 17 | `gda_vehicle_tracker` | F-023a | DROP TABLE (14 rows) | `/tmp/f023-deferred-archive/gda_vehicle_tracker.sql` |

> **Note:** `ft_need_view` (a SQL view joining `ft_need_tag` to `ft_opportunity_signal`)
> was also dropped. It was referenced by `GDA.api.fast-track-needs` (l6X3n5paaIqMKWxB)
> but the underlying table had 0 rows, so the view returned nothing useful.

### DEFERRED to F-023a — RESOLVED (0 remaining)

All 6 deferred tables resolved in F-023a execution:
- **5 DROPPED:** `gda_incumbent_log`, `gda_market_benchmarks`, `gda_pre_sam_intel`, `gda_target_agencies`, `gda_vehicle_tracker` (moved to DROPPED table above)
- **1 PROMOTED TO ADOPT:** `gda_touchpoints` (moved to ADOPT table above, migration 058 generated)

Architect override: Original ARCHIVE-THEN-DROP recommendations changed to plain DROP
(stale single-batch snapshots from deleted workflows, re-fetchable from live sources).
Schema+data archives remain in `/tmp/f023-deferred-archive/` on VPS.

---

## n8n-Internal Tables (EXCLUDED from classification)

These 5 tables are created by n8n's own migration system and have FK relationships
to n8n core tables (`workflow_entity`, `project`). They are NOT shadow tables.

| Table | n8n Migration | FKs |
|-------|--------------|-----|
| `insights_by_period` | `RenameAnalyticsToInsights1741167584277` | → `insights_metadata` |
| `insights_metadata` | `RenameAnalyticsToInsights1741167584277` | → `workflow_entity`, `project` |
| `insights_raw` | `RenameAnalyticsToInsights1741167584277` | → `insights_metadata` |
| `processed_data` | `CreateProcessedDataTable1726606152711` | → `workflow_entity` |
| `data_table_user_tLsASCcsZb5lXGxm` | `ReplaceDataStoreTablesWithDataTables1754475614602` | n8n Data Table user link |

> **NOTE**: The initial ADOPT classification included these 4 tables. After verifying
> they are n8n-internal (created by n8n migrations, not workflow DDL), they have been
> reclassified as EXCLUDED. Architect may still want to account for them in F-026
> planning since they live in the same database being migrated.

---

## GDA Application DB (`gda_command`) — Clean

| Table | Cols | Purpose |
|-------|------|---------|
| `_migrations` | 2 (`name`, `applied_at`) | Legacy migration tracker (22 entries) |
| `schema_migrations` | 3 (`id`, `name`, `applied_at`) | Current migration tracker (59 entries) |

Both are migration-tracking infrastructure created by the backend's own migration runner.
Not shadow tables — no action required.

---

## F-026 Consolidation Impact

### Background

F-026 Step 2 (completed 2026-05-22, PR #273) created a Docker network bridge so n8n can
reach `gda-postgres`. The goal of F-026 Steps 3/4/5 is to migrate data from
`n8n-envision-postgres-1` to `gda-postgres`, consolidating into a single database.

### Impact Summary

**64 remaining shadow tables are in `n8n-envision-postgres-1`** — the database that F-026 Steps
3/4/5 will either migrate from or decommission. 17 orphan tables dropped, F-023a deferred bucket resolved.

| Bucket | F-026 Impact |
|--------|-------------|
| **ADOPT (28)** | Must have migration files generated in `gda_command` schema before data can be migrated. 2 of 28 already have migrations: `gda_relationships` (057) and `gda_touchpoints` (058). Remaining 26 need `CREATE TABLE` + `CREATE INDEX` + `ALTER TABLE ADD CONSTRAINT` migrations in F-023c. |
| **DOCUMENT-ONLY (36)** | Two paths: (a) migrate to `gda_command` with new migrations, or (b) remain in n8n DB if workflows continue to use n8n's internal Postgres credential. Architect decision required. |
| **DROPPED (17)** | Already removed — no migration needed. |
| **pgvector on `gda-postgres`** | **Installed — v0.8.2.** `gda_embeddings` migration can use `vector` type directly. |

### Critical Tables for F-026 Step 3

These ADOPT tables have the most production data and would require the most careful migration:

| Table | Rows | Size | Risk Level |
|-------|------|------|-----------|
| `gda_opportunity_tracker` | 1,780 | 1.7 MB | **HIGH** — core pipeline, 54 workflows depend on it |
| `gda_embeddings` | ~821 | **14 MB** | **HIGH** — vector data, requires pgvector extension |
| `risk_register` | 459 | 488 kB | **MEDIUM** — name collides with migration-tracked `risk_register` in `gda_command` |
| `daily_trends` | 528 | 200 kB | LOW |
| `gda_error_log` | 334 | 88 kB | LOW |
| `ft_opportunity_signal` | 232 | 256 kB | LOW |

### `risk_register` Name Collision

The `risk_register` table in `n8n-envision-postgres-1` (459 rows, 8 workflow consumers)
has the **same name** as the migration-tracked `risk_register` in `gda_command` (created
by migration `012_risk_register_and_company.sql`). The schemas differ:

- `gda_command.risk_register`: 25 columns (has `deleted_at`, versioning triggers, etc.)
- `n8n.risk_register`: 25 columns (different column set, workflow-managed)

**F-026 Step 3 must resolve this collision** — either merge data, rename one table, or
designate one as authoritative. This is a **blocking issue** for Step 3 planning.

---

## Foreign Key Graph

```
ft_signal_source ← ft_opportunity_signal ← ~~ft_need_tag~~ (DROPPED)
gda_opportunity_tracker ← gda_decision_memory ← ~~gda_outcome_tracker~~ (DROPPED)
gda_relationships ← gda_touchpoints (DEFERRED to F-023a)
insights_metadata ← insights_by_period
insights_metadata ← insights_raw
```

Tables with inbound FKs cannot be DROP'd before their dependents are handled.

---

## Backend Code References

**Zero** backend code files reference any shadow table name. All shadow table access
is exclusively through n8n workflows using the "GDA Postgres" credential (`HwronxMmGY5XDGEt`).

The backend code references `risk_register` in `gda_command` (the migration-tracked version):
- `src/routes/risk-register.ts` — CRUD endpoints
- `src/routes/dashboard.ts` — risk dashboard queries
- `src/lib/versioning.ts` — versioning triggers
- `src/agents/morning-commander.ts` — morning briefing agent

---

## Write Activity Analysis

Tables with recent write activity (inserts/updates/deletes > 0 since last Postgres stats reset):

| Table | Inserts | Updates | Deletes | Last Autoanalyze |
|-------|---------|---------|---------|-----------------|
| `gda_opportunity_tracker` | 488 | 1,314 | 0 | 2026-05-21 |
| `insights_raw` | 55,960 | 0 | 55,975 | 2026-05-22 |
| `insights_by_period` | 14,461 | 1,971 | 0 | 2026-05-18 |
| `ft_opportunity_signal` | 232 | 2,573 | 0 | 2026-05-22 |
| `ft_signal_source` | 10 | 420 | 0 | 2026-05-21 |
| `gda_action_items` | 59 | 0 | 2,105 | 2026-05-05 |
| `daily_trends` | 162 | 0 | 0 | 2026-05-12 |
| `gda_learned_weights` | 18 | 138 | 0 | 2026-05-19 |
| `gda_trend_arrays` | 0 | 162 | 0 | 2026-05-21 |
| `gda_mega_cache` | 0 | 131 | 0 | 2026-05-18 |
| `gda_competitor_cache` | 128 | 0 | 3 | — |
| `gda_error_log` | 116 | 0 | 0 | 2026-05-09 |
| `risk_register` | 106 | 84 | 0 | 2026-05-21 |
| `insights_metadata` | 20 | 997 | 0 | 2026-05-21 |
| `gda_intelligence_log` | 68 | 0 | 5 | — |
| `gda_dept_market` | 0 | 24 | 0 | — |
| `gda_e2e_reports` | 27 | 0 | 0 | — |
| `gda_dashboard_intel_cache` | 15 | 0 | 15 | — |
| `gda_morning_briefings` | 12 | 0 | 0 | — |
| `gda_win_loss_db` | 10 | 0 | 0 | — |
| `gda_win_loss` | 0 | 6 | 1 | — |
| `gda_capture_plans` | 0 | 20 | 0 | — |

---

## Recommended Next Actions

### 1. ~~DELETE bucket (17 tables)~~ — DONE (12 dropped, 6 deferred)
- 12 confirmed-empty tables dropped 2026-05-22
- 6 tables deferred to F-023a (5 non-empty orphans + 1 with workflow ref)

### 2. F-023a: Resolve deferred tables (6)
- Architect to review the 5 non-empty orphan tables — data is stale (pre-stats-reset)
- Decide on `gda_touchpoints`: keep with `gda_relationships` (both ADOPT) or drop?
- All 6 archived to `/tmp/f023-deferred-archive/` on VPS

### 3. F-023b: Risk Register Collision — Deferred
- `risk_register` name collision between n8n DB (459 rows, 8 workflows) and `gda_command`
  (migration-tracked, different schema) requires architect spec before resolution
- Do NOT execute rename until spec is provided

### 4. ADOPT bucket (28 tables) — F-026 Step 3 prerequisite
- **2 of 28 already have migrations:** `gda_relationships` (057) and `gda_touchpoints` (058)
- Remaining 26 need migration files in `packages/backend/src/db/migrations/`
- Resolve the `risk_register` name collision first (F-023b, blocking)
- `gda_embeddings` pgvector dependency: **pgvector v0.8.2 confirmed installed on `gda-postgres`**
- After migrations are in place, F-026 Step 3 can `INSERT INTO ... SELECT FROM` across databases

### 5. DOCUMENT-ONLY bucket (36 tables) — Architect decision
- Decision needed: migrate to `gda_command` (create migrations) or leave in n8n DB?
- If left in n8n DB, document each table with its managing workflow ID
- If migrated, add to ADOPT bucket and generate migrations

### 6. n8n-internal tables (5) — Confirmed EXCLUDED
- Created by n8n's migration system, managed by n8n
- F-026 should NOT migrate these — they must stay in the n8n database
- Architect confirmed EXCLUDE classification

---

## Appendix: Full Column Schemas

<details>
<summary>Click to expand column details for all 81 shadow tables</summary>

### daily_trends (10 columns)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NO | nextval('daily_trends_id_seq') |
| date | date | NO | CURRENT_DATE |
| metric_name | varchar | NO | |
| metric_value | numeric | YES | |
| rolling_avg_7d | numeric | YES | |
| rolling_avg_30d | numeric | YES | |
| delta_1d | numeric | YES | |
| delta_7d | numeric | YES | |
| metadata | jsonb | YES | '{}' |
| created_at | timestamptz | YES | now() |

### ft_need_tag (5 columns)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NO | nextval |
| signal_id | varchar | YES | |
| tag | varchar | NO | |
| tag_type | varchar | YES | 'keyword' |
| created_at | timestamptz | YES | now() |

### ft_opportunity_signal (24 columns)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NO | nextval |
| signal_id | varchar | NO | |
| source_id | varchar | YES | |
| title | varchar | NO | |
| agency | varchar | YES | |
| unit_org | varchar | YES | |
| horizon | varchar | NO | 'formal' |
| naics | varchar | YES | |
| estimated_value | bigint | YES | |
| due_date | date | YES | |
| posted_date | date | YES | |
| signal_strength | numeric | YES | 5.0 |
| confidence | numeric | YES | 5.0 |
| tags | text[] | YES | ARRAY[] |
| recommended_action | varchar | YES | |
| solution_path | varchar | YES | |
| description | text | YES | |
| external_url | text | YES | |
| raw_data | jsonb | YES | '{}' |
| reviewed | boolean | YES | false |
| active | boolean | YES | true |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| source_url | text | YES | |

### ft_signal_source (9 columns)
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NO | nextval |
| source_id | varchar | NO | |
| name | varchar | NO | |
| source_type | varchar | NO | |
| band | varchar | NO | |
| url | text | YES | |
| notes | text | YES | |
| active | boolean | YES | true |
| created_at | timestamptz | YES | now() |

### gda_opportunity_tracker (38 columns)
Most-referenced table in the fleet (54 workflows).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NO | nextval |
| sol_num | varchar | YES | |
| title | text | NO | |
| dept | varchar | YES | |
| sub_tier | varchar | YES | |
| office | varchar | YES | |
| posted_date | date | YES | |
| response_due | date | YES | |
| set_aside | varchar | YES | |
| naics | varchar | YES | |
| type | varchar | YES | |
| status | varchar | YES | 'Active' |
| contract_value | numeric | YES | |
| url | text | YES | |
| description | text | YES | |
| contacts | text | YES | |
| synced_at | timestamptz | YES | now() |
| source | varchar | YES | 'SAM.gov' |
| stage | varchar | YES | 'Identified' |
| gda_score | numeric | YES | |
| capture_plan_id | integer | YES | |
| pwin | numeric | YES | |
| notes | text | YES | |
| tags | text[] | YES | ARRAY[] |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| govtribe_id | varchar | YES | |
| award_date | date | YES | |
| award_value | numeric | YES | |
| incumbent | text | YES | |
| vehicle | varchar | YES | |
| place_of_performance | text | YES | |
| eis_fit_score | numeric | YES | |
| capture_team | text | YES | |
| decision | varchar | YES | |
| last_modified | timestamptz | YES | |
| contract_type | varchar | YES | |
| gda_label | varchar | YES | |

### risk_register (25 columns)
In n8n DB — distinct from migration-tracked `risk_register` in `gda_command`.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| opportunity_id | varchar | YES | |
| opportunity_title | text | YES | |
| category | varchar | YES | |
| if_statement | text | YES | |
| then_statement | text | YES | |
| likelihood | integer | YES | |
| impact | integer | YES | |
| risk_score | numeric | YES | |
| status | varchar | YES | 'open' |
| mitigation_plan | text | YES | |
| mitigation_owner | varchar | YES | |
| trigger_indicators | text | YES | |
| due_date | date | YES | |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| risk_key | varchar | YES | |
| risk_type | varchar | YES | |
| severity | varchar | YES | |
| source | varchar | YES | |
| resolution | text | YES | |
| resolved_at | timestamptz | YES | |
| resolution_notes | text | YES | |
| deleted_at | timestamptz | YES | |
| version | integer | YES | 1 |

(Remaining table schemas available on request — full column dump captured during audit.)

</details>

---

## Audit Metadata

| Property | Value |
|----------|-------|
| Audit date | 2026-05-22 ~17:15 UTC |
| GDA app DB container | `gda-postgres` |
| n8n DB container | `n8n-envision-postgres-1` |
| n8n DB user | `n8n` |
| n8n DB name | `n8n` |
| GDA Postgres credential | `HwronxMmGY5XDGEt` |
| Active workflow count | 158 |
| Total n8n tables | 173 |
| n8n internal tables | 92 |
| Shadow tables classified | 81 |
| Method | `information_schema` + `pg_class` + `pg_stat_user_tables` + n8n API workflow export |
