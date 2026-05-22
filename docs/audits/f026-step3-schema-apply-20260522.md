# F-026 Step 3 Prep — Migrations 056-084 Applied to Prod gda_command

**Date:** 2026-05-22T20:08:56Z – 2026-05-22T20:10:07Z  
**Operator:** devin-manual-apply (via `docker exec -i gda-postgres psql -U gda -d gda_command -1`)  
**Reason:** Migrations merged in PR #288 but `gda-backend` (up 27h) was deployed before that merge. Applied manually per architect directive — no backend restart during migration window.

## Pre-Apply State

| Metric | Value |
|--------|-------|
| gda-postgres | Up 21h (healthy) |
| schema_migrations count | 59 |
| Latest migration | 055_govwin_wsapi_integration.sql |
| Total tables | 86 |
| ADOPT tables present | 0 of 28 |

## Migration Apply Log

All 29 migrations applied via `psql -1` (single-transaction per file). Zero failures.

| # | Migration | Timestamp (UTC) | Exit | Key Output |
|---|-----------|-----------------|------|------------|
| 1 | 056_schema_migrations_provenance.sql | 2026-05-22T20:08:56Z | 0 | ALTER TABLE |
| 2 | 057_n8n_gda_relationships.sql | 2026-05-22T20:08:56Z | 0 | CREATE TABLE |
| 3 | 058_n8n_gda_touchpoints.sql | 2026-05-22T20:08:56Z | 0 | CREATE TABLE |
| 4 | 059_n8n_gda_risk_register.sql | 2026-05-22T20:08:57Z | 0 | CREATE TABLE + 4 indexes |
| 5 | 060_n8n_gda_opportunity_tracker.sql | 2026-05-22T20:08:57Z | 0 | CREATE TABLE + 4 indexes |
| 6 | 061_n8n_gda_capture_plans.sql | 2026-05-22T20:08:57Z | 0 | CREATE TABLE + 1 index |
| 7 | 062_n8n_gda_intelligence_log.sql | 2026-05-22T20:08:57Z | 0 | CREATE TABLE + 3 indexes |
| 8 | 063_n8n_gda_competitor_watchlist.sql | 2026-05-22T20:08:57Z | 0 | CREATE TABLE + 3 indexes |
| 9 | 064_n8n_opportunity_alerts.sql | 2026-05-22T20:08:57Z | 0 | CREATE TABLE + 4 indexes |
| 10 | 065_n8n_gda_competitor_cache.sql | 2026-05-22T20:08:58Z | 0 | CREATE TABLE + 3 indexes |
| 11 | 066_n8n_gda_action_items.sql | 2026-05-22T20:08:58Z | 0 | CREATE TABLE + 3 indexes |
| 12 | 067_n8n_gda_active_contracts.sql | 2026-05-22T20:08:58Z | 0 | CREATE TABLE |
| 13 | 068_n8n_gda_dashboard_intel_cache.sql | 2026-05-22T20:08:58Z | 0 | CREATE TABLE |
| 14 | 069_n8n_daily_trends.sql | 2026-05-22T20:08:58Z | 0 | CREATE TABLE + 3 indexes |
| 15 | 070_n8n_gda_opportunity_alerts.sql | 2026-05-22T20:08:58Z | 0 | CREATE TABLE + 3 indexes |
| 16 | 071_n8n_gda_morning_briefings.sql | 2026-05-22T20:08:58Z | 0 | CREATE TABLE |
| 17 | 072_n8n_gda_learned_weights.sql | 2026-05-22T20:08:58Z | 0 | CREATE TABLE + 2 indexes |
| 18 | 073_n8n_gda_win_loss.sql | 2026-05-22T20:08:59Z | 0 | CREATE TABLE |
| 19 | 074_n8n_gda_error_log.sql | 2026-05-22T20:08:59Z | 0 | CREATE TABLE |
| 20 | 075_n8n_gda_saved_opportunities.sql | 2026-05-22T20:08:59Z | 0 | CREATE TABLE |
| 21 | 076_n8n_gda_teaming_partners.sql | 2026-05-22T20:08:59Z | 0 | CREATE TABLE + 1 index |
| 22 | 077_n8n_ft_signal_source.sql | 2026-05-22T20:08:59Z | 0 | CREATE TABLE + 1 index |
| 23 | 078_n8n_ft_opportunity_signal.sql | 2026-05-22T20:08:59Z | 0 | CREATE TABLE + 4 indexes |
| 24 | 079_n8n_gda_embeddings.sql | 2026-05-22T20:08:59Z | 0 | CREATE EXTENSION (already exists), CREATE TABLE + 2 indexes |
| 25 | 080_n8n_govtribe_cache.sql | 2026-05-22T20:08:59Z | 0 | CREATE TABLE + 3 indexes |
| 26 | 081_n8n_gda_wargames.sql | 2026-05-22T20:09:00Z | 0 | CREATE TABLE |
| 27 | 082_n8n_gda_win_loss_db.sql | 2026-05-22T20:09:00Z | 0 | CREATE TABLE |
| 28 | 083_n8n_gda_trend_arrays.sql | 2026-05-22T20:09:00Z | 0 | CREATE TABLE |
| 29 | 084_n8n_gda_contacts.sql | 2026-05-22T20:09:00Z | 0 | CREATE TABLE + 1 index |

Total apply time: ~4 seconds (20:08:56Z → 20:09:00Z).

## schema_migrations Registration

All 29 entries inserted at 2026-05-22T20:10:07Z with `applied_by = 'devin-manual-apply'`. No conflicts.

## Post-Apply Verification

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| schema_migrations count | 88 | 88 | PASS |
| ADOPT tables present | 28 | 28 | PASS |
| Total tables | 114 | 114 | PASS |
| pgvector extension | present | v0.8.2 | PASS |
| gda_embeddings.embedding type | vector | vector | PASS |
| gda_embeddings.embedding atttypmod | 1536 | 1536 | PASS |
| All 28 ADOPT tables empty | 0 rows each | 0 rows each | PASS |
| gda-backend health | 200 | 200 | PASS |
| gda-backend container | healthy | Up 27h (healthy) | PASS |

## ADOPT Table Row Counts (all empty — schema only, no data yet)

| Table | Rows |
|-------|------|
| gda_relationships | 0 |
| ft_signal_source | 0 |
| gda_touchpoints | 0 |
| ft_opportunity_signal | 0 |
| gda_risk_register | 0 |
| gda_opportunity_tracker | 0 |
| gda_capture_plans | 0 |
| gda_intelligence_log | 0 |
| gda_competitor_watchlist | 0 |
| opportunity_alerts | 0 |
| gda_competitor_cache | 0 |
| gda_action_items | 0 |
| gda_active_contracts | 0 |
| gda_dashboard_intel_cache | 0 |
| daily_trends | 0 |
| gda_opportunity_alerts | 0 |
| gda_morning_briefings | 0 |
| gda_learned_weights | 0 |
| gda_win_loss | 0 |
| gda_error_log | 0 |
| gda_saved_opportunities | 0 |
| gda_teaming_partners | 0 |
| gda_embeddings | 0 |
| govtribe_cache | 0 |
| gda_wargames | 0 |
| gda_win_loss_db | 0 |
| gda_trend_arrays | 0 |
| gda_contacts | 0 |

## Notes

- Migration 056 added provenance columns (`commit_sha`, `applied_by`, `file_sha256`) to `schema_migrations`. Existing 59 rows backfilled with `applied_by = 'unknown (pre-F-019)'`.
- Migration 079 (gda_embeddings) logged `NOTICE: extension "vector" already exists, skipping` — pgvector was already installed on gda-postgres. Expected.
- `gda-backend` was NOT restarted. The running container still has pre-PR#288 code but the schema is now current. When the backend is next deployed, the migration runner will find all 88 entries in `schema_migrations` and skip them — no re-apply risk.
- VPS log file: `/var/log/f026-step3-schema-apply-20260522T200856Z.log`
