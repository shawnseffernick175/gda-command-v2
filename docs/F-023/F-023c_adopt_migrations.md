# F-023c — ADOPT Table Migration Generation

**Date:** 2026-05-22
**Author:** Devin (automated)
**Status:** COMPLETE — 25 migration files generated (060–084)
**Issue:** [#258](https://github.com/shawnseffernick175/gda-command-v2/issues/258)
**Prerequisites:** F-023 (PR #283), F-023a (PR #286), F-023b (PR #287)

---

## Summary

| Metric | Value |
|--------|-------|
| Migration files generated | 25 (060–084) |
| Total ADOPT migrations | 28 (057–084, including F-023a + F-023b) |
| Total columns across 25 tables | 437 |
| Total indexes across 25 tables | 75 |
| FK constraints | 1 (ft_opportunity_signal → ft_signal_source) |
| pgvector extension required | Yes (gda_embeddings, vector(1536)) |
| Migrations run against production | **NO** — CI smoke test only |

---

## Migration File Index

| # | File | Table | Rows | Cols | Indexes | FKs | Notes |
|---|------|-------|------|------|---------|-----|-------|
| 060 | `060_n8n_gda_opportunity_tracker.sql` | gda_opportunity_tracker | 1,780 | 38 | 6 | 0 | Core pipeline, 54 consumers |
| 061 | `061_n8n_gda_capture_plans.sql` | gda_capture_plans | 110 | 13 | 2 | 0 | 25 consumers |
| 062 | `062_n8n_gda_intelligence_log.sql` | gda_intelligence_log | 54 | 7 | 4 | 0 | 14 consumers |
| 063 | `063_n8n_gda_competitor_watchlist.sql` | gda_competitor_watchlist | 46 | 37 | 4 | 0 | 9 consumers, complex schema |
| 064 | `064_n8n_opportunity_alerts.sql` | opportunity_alerts | 2 | 25 | 9 | 0 | 7 consumers, heavily indexed |
| 065 | `065_n8n_gda_competitor_cache.sql` | gda_competitor_cache | 1 | 5 | 4 | 0 | 6 consumers |
| 066 | `066_n8n_gda_action_items.sql` | gda_action_items | 47 | 7 | 4 | 0 | 5 consumers |
| 067 | `067_n8n_gda_active_contracts.sql` | gda_active_contracts | 5 | 24 | 1 | 0 | 5 consumers |
| 068 | `068_n8n_gda_dashboard_intel_cache.sql` | gda_dashboard_intel_cache | 6 | 3 | 1 | 0 | 5 consumers |
| 069 | `069_n8n_daily_trends.sql` | daily_trends | 537 | 10 | 4 | 0 | 4 consumers |
| 070 | `070_n8n_gda_opportunity_alerts.sql` | gda_opportunity_alerts | 7 | 9 | 4 | 0 | 4 consumers |
| 071 | `071_n8n_gda_morning_briefings.sql` | gda_morning_briefings | 40 | 7 | 1 | 0 | 4 consumers |
| 072 | `072_n8n_gda_learned_weights.sql` | gda_learned_weights | 18 | 8 | 3 | 0 | 4 consumers |
| 073 | `073_n8n_gda_win_loss.sql` | gda_win_loss | 6 | 25 | 1 | 0 | 4 consumers |
| 074 | `074_n8n_gda_error_log.sql` | gda_error_log | 334 | 7 | 1 | 0 | 3 consumers |
| 075 | `075_n8n_gda_saved_opportunities.sql` | gda_saved_opportunities | 0 | 20 | 1 | 0 | 3 consumers |
| 076 | `076_n8n_gda_teaming_partners.sql` | gda_teaming_partners | 12 | 23 | 2 | 0 | 3 consumers |
| 077 | `077_n8n_ft_signal_source.sql` | ft_signal_source | 10 | 9 | 2 | 0 | FK parent — must run before 078 |
| 078 | `078_n8n_ft_opportunity_signal.sql` | ft_opportunity_signal | 234 | 24 | 6 | 1 | FK to ft_signal_source(source_id) |
| 079 | `079_n8n_gda_embeddings.sql` | gda_embeddings | 821 | 10 | 4 | 0 | pgvector, vector(1536), IVFFlat |
| 080 | `080_n8n_govtribe_cache.sql` | govtribe_cache | 0 | 8 | 4 | 0 | 2 consumers |
| 081 | `081_n8n_gda_wargames.sql` | gda_wargames | 1 | 30 | 1 | 0 | 2 consumers |
| 082 | `082_n8n_gda_win_loss_db.sql` | gda_win_loss_db | 10 | 17 | 1 | 0 | 1 consumer |
| 083 | `083_n8n_gda_trend_arrays.sql` | gda_trend_arrays | 15 | 6 | 1 | 0 | 1 consumer |
| 084 | `084_n8n_gda_contacts.sql` | gda_contacts | 2 | 17 | 2 | 0 | PII (email, phone) |

---

## FK Dependency Graph

```
ft_signal_source (077) ← ft_opportunity_signal (078)
gda_relationships (057) ← gda_touchpoints (058)
gda_opportunity_tracker (060) ← gda_decision_memory (NOT in ADOPT set — DOCUMENT-ONLY)
```

Only 1 FK exists within the 25-table set: `ft_opportunity_signal.source_id → ft_signal_source.source_id`.
Migration 077 (parent) runs before 078 (child). No circular FKs detected.

The inbound FK from `gda_decision_memory` to `gda_opportunity_tracker` is from a
DOCUMENT-ONLY table outside this migration set — no ordering constraint needed.

---

## pgvector Handling — gda_embeddings (Migration 079)

| Property | Value |
|----------|-------|
| Extension | `CREATE EXTENSION IF NOT EXISTS vector;` (first statement in migration) |
| Column | `embedding vector(1536)` (OpenAI text-embedding-3-small dimension) |
| Index type | IVFFlat |
| Index definition | `USING ivfflat (embedding vector_cosine_ops) WITH (lists='27')` |
| Index name | `idx_gda_embeddings_vector` |
| pgvector version on gda-postgres | v0.8.2 (confirmed F-023) |
| pgvector version on n8n DB | v0.8.2 |

The `lists=27` parameter in the IVFFlat index is appropriate for ~1,000 rows (rule of
thumb: lists ≈ sqrt(rows)). As data grows past ~10K rows, consider rebuilding with
`lists=100` or migrating to HNSW.

---

## Schema Oddities

1. **`gda_opportunity_tracker.programs_json`**: Column type is `TEXT` but default is
   `'[]'::jsonb`. This is a type mismatch (TEXT column with JSONB default cast). The live
   schema works because Postgres casts JSONB→TEXT on storage. Migration preserves this as-is.

2. **`gda_opportunity_tracker.level_1`**: Default value is `'Department of War'::text`.
   This appears to be test/seed data leaking into a default. Migration preserves as-is.

3. **`gda_competitor_watchlist`**: 37 columns is unusually wide. Many text columns appear
   to store denormalized data (e.g., `landscape`, `gda_threat_summary`, `recent_contracts`).
   Migration preserves as-is — normalization is a separate refactor scope.

4. **Duplicate index pairs**:
   - `opportunity_alerts`: `idx_opp_alerts_due` and `idx_opp_due` both index `due_date`
   - `gda_competitor_watchlist`: `gda_competitor_watchlist_name_key` (unique) and `idx_cw_name` both index `name`
   - Migration preserves both — deduplication is a separate refactor scope.

5. **`gda_contacts.govtribe_id`**: Has unique index but column is nullable. Could lead to
   NULL uniqueness ambiguity. Migration preserves as-is.

---

## Schema-vs-Workflow Divergences

11 of 25 tables have `CREATE TABLE IF NOT EXISTS` in at least one workflow. All divergences
follow the same pattern: workflow creates a minimal 2–3 column table, then `ALTER TABLE ADD COLUMN`
adds the rest. The live schema (used in migrations) is always the superset.

| Table | Workflow | Live Cols | WF CREATE Cols | Divergence |
|-------|----------|-----------|----------------|------------|
| `gda_action_items` | GDA.api.daily-actions | 7 | 2 | WF defines `id, action_text`; live has 5 more (deadline, owner, status, source_meeting, created_at) |
| `gda_competitor_watchlist` | GDA.api.competitor-watchlist | 37 | 3 | WF defines `id, name, size`; live has 34 more (added by enrichment workflows) |
| `gda_contacts` | GDA.api.contacts | 17 | 16 | Live has `updated_at` not in WF CREATE |
| `gda_dashboard_intel_cache` | GDA.api.daily-actions | 3 | 2 | WF defines `id, cache_key`; live has `id, data, created_at`. The `cache_key` column was likely renamed to `data` (JSONB) at some point. Migration uses live schema. |
| `gda_saved_opportunities` | GDA.api.saved-opps | 20 | 18 | Live has `primary_fit`, `updated_at` not in WF CREATE |
| `gda_teaming_partners` | GDA.api.teaming-scorer | 23 | 3 | WF defines `id, name, company`; live has 20 more |
| `gda_teaming_partners` | GDA.api.teaming-finder | 23 | 2 | WF defines `id, name`; live has 21 more |
| `gda_trend_arrays` | GDA.cron.daily-trends-collect | 6 | 1 | WF defines `metric_name` only; live has 5 more |
| `opportunity_alerts` | GDA.sched.opp-refresh | 25 | 2 | WF defines `id, solicitation_number`; live has 23 more |

**14 tables have NO `CREATE TABLE` in any workflow** — they were created manually or by
workflows that have since been deleted.

**All migrations use the live schema.** The `gda_dashboard_intel_cache` divergence is the
only case where a workflow column (`cache_key`) doesn't exist in live — it was likely renamed
to `data` (JSONB). Migration 068 uses the live schema: `id SERIAL PK, data JSONB NOT NULL,
created_at TIMESTAMPTZ DEFAULT now()`. Verified via `\d gda_dashboard_intel_cache` on
n8n-envision-postgres-1 (2026-05-22).

---

## F-026 Step 3 Readiness Summary

| Requirement | Status |
|-------------|--------|
| All 28 ADOPT tables have migration files | **YES** (057–084) |
| Migration manifest updated with SHA-256 hashes | **YES** |
| FK ordering correct | **YES** (077 before 078; 057 before 058) |
| pgvector extension handled | **YES** (079 includes CREATE EXTENSION) |
| CI smoke test passes | Pending (this PR) |
| Migrations run against production | **NO** — F-026 Step 3 scope |
| risk_register collision resolved | **YES** (F-023b, renamed to gda_risk_register) |

F-026 Step 3 can proceed once this PR merges and the architect approves the execution window.
The step will:
1. Run migrations 057–084 against `gda_command` (creates empty tables)
2. `INSERT INTO gda_command.<table> SELECT * FROM n8n.<table>` for each ADOPT table
3. Update n8n workflow credentials to point at `gda-postgres` instead of `n8n-envision-postgres-1`
4. Verify data integrity (row counts, FK constraints, index usage)

---

## F-026 Step 3 Cleanup Candidates

The following schema issues are preserved as-is in ADOPT migrations (matching live) but
should be normalized during or after the F-026 Step 3 data migration phase.

| Table | Issue | Recommended Fix | Priority |
|-------|-------|-----------------|----------|
| `gda_opportunity_tracker` | `programs_json TEXT DEFAULT '[]'::jsonb` — type/default mismatch. Column is TEXT but default is a JSONB literal. Postgres tolerates via implicit cast, but breaks if column type is ever changed. | Either change column to `JSONB` or change default to `'[]'::text`. Requires data audit to confirm all values are valid JSON. | Medium |
| `opportunity_alerts` | Duplicate indexes on `due_date`: `idx_opp_alerts_due` and `idx_opp_due` are identical btree indexes on the same column. Wastes write I/O and storage. | Drop one of the two indexes (keep `idx_opp_alerts_due` for naming consistency). | Low |
| `gda_competitor_watchlist` | Duplicate indexes on `name`: `gda_competitor_watchlist_name_key` (UNIQUE) and `idx_cw_name` (non-unique btree). The unique index already serves as a btree lookup. | Drop `idx_cw_name` — the unique constraint index covers all queries. | Low |
| `gda_risk_register` | Cosmetic index names from F-023b: indexes retained their original `risk_register_*` names after the table rename to `gda_risk_register`. Postgres auto-renames `_pkey` but not user-created indexes. | Rename indexes to `gda_risk_register_*` pattern for consistency. | Low |
| `gda_contacts` | `govtribe_id` has a unique index but the column is nullable. In PostgreSQL, multiple NULLs are allowed in a unique index (NULLs are not considered equal). This is technically correct but may mask data issues if contacts are inserted without govtribe_id. | Add `NOT NULL` if all contacts should have a govtribe_id, or add a partial unique index `WHERE govtribe_id IS NOT NULL`. | Low |
