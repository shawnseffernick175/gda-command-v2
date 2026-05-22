# F-026 Step 3 — Staging Rehearsal Report

**Date:** 2026-05-22  
**Target:** gda-postgres-staging (n8n_staging → gda_command_staging)  
**Script:** `scripts/f026/step3-data-migration.sh --target=staging`  
**Plan:** `docs/runbooks/f026-step3-plan.md` (PR #294, merged)

## Pre-flight

| Check | Result |
|-------|--------|
| pgvector extension | v0.8.2 ✓ |
| Embedding column type | vector on both ✓ |
| Vector dimension (atttypmod) | 1536 on both ✓ |
| Source tables | 28 ADOPT tables in n8n_staging ✓ |
| Target tables | 28 empty ADOPT tables in gda_command_staging ✓ |
| Staging refresh | /root/refresh-staging.sh completed, parity confirmed ✓ |
| Migrations 057-084 | Applied to gda_command_staging (114 total tables) ✓ |

## Pass 1 — Fresh Migration (Section 9b)

**Timestamp:** 2026-05-22T19:28:08Z  
**Log:** `/var/log/f026-step3-migration-staging-20260522T192808Z.log`

| Result | Count |
|--------|-------|
| **Copied** | 28 |
| **Skipped** | 0 |
| **Failed** | 0 |
| **Exit code** | 0 |

### Parity Report — Pass 1

| Table | Source | Target | Match |
|-------|--------|--------|-------|
| gda_relationships | 0 | 0 | ✓ |
| ft_signal_source | 10 | 10 | ✓ |
| gda_touchpoints | 0 | 0 | ✓ |
| ft_opportunity_signal | 234 | 234 | ✓ |
| gda_risk_register | 464 | 464 | ✓ |
| gda_opportunity_tracker | 1,780 | 1,780 | ✓ |
| gda_capture_plans | 110 | 110 | ✓ |
| gda_intelligence_log | 54 | 54 | ✓ |
| gda_competitor_watchlist | 46 | 46 | ✓ |
| opportunity_alerts | 2 | 2 | ✓ |
| gda_competitor_cache | 1 | 1 | ✓ |
| gda_action_items | 47 | 47 | ✓ |
| gda_active_contracts | 5 | 5 | ✓ |
| gda_dashboard_intel_cache | 6 | 6 | ✓ |
| daily_trends | 537 | 537 | ✓ |
| gda_opportunity_alerts | 7 | 7 | ✓ |
| gda_morning_briefings | 40 | 40 | ✓ |
| gda_learned_weights | 18 | 18 | ✓ |
| gda_win_loss | 6 | 6 | ✓ |
| gda_error_log | 334 | 334 | ✓ |
| gda_saved_opportunities | 0 | 0 | ✓ |
| gda_teaming_partners | 12 | 12 | ✓ |
| gda_embeddings | 821 | 821 | ✓ |
| govtribe_cache | 0 | 0 | ✓ |
| gda_wargames | 1 | 1 | ✓ |
| gda_win_loss_db | 10 | 10 | ✓ |
| gda_trend_arrays | 15 | 15 | ✓ |
| gda_contacts | 2 | 2 | ✓ |
| **TOTAL** | **4,562** | **4,562** | **28/28** |

## Constraint Verification (Section 7)

### 7a. FK Integrity

| FK Relationship | Orphan Count | Result |
|----------------|-------------|--------|
| gda_touchpoints → gda_relationships (relationship_id) | 0 | ✓ |
| ft_opportunity_signal → ft_signal_source (source_id) | 0 | ✓ |

### 7b. UNIQUE / PK Constraints

All 28 tables have valid primary keys. No constraint violations detected.
28 PRIMARY KEY constraints verified across all ADOPT tables.

### 7e. Sequence Sync Verification

| Table | Sequence Value | MAX(id) | Result |
|-------|---------------|---------|--------|
| gda_relationships | 1 | 0 | ✓ (empty, is_called=false) |
| ft_signal_source | 10 | 10 | ✓ |
| gda_touchpoints | 1 | 0 | ✓ (empty, is_called=false) |
| ft_opportunity_signal | 2,823 | 2,823 | ✓ |
| gda_risk_register | 5,872 | 5,872 | ✓ |
| gda_opportunity_tracker | 2,658 | 2,658 | ✓ |
| gda_capture_plans | 114 | 114 | ✓ |
| gda_intelligence_log | 87 | 87 | ✓ |
| gda_competitor_watchlist | 46 | 46 | ✓ |
| opportunity_alerts | 29 | 29 | ✓ |
| gda_competitor_cache | 1 | 0 | ✓ (id=0 row, seq clamped to 1) |
| gda_action_items | 3,310 | 3,310 | ✓ |
| gda_active_contracts | 5 | 5 | ✓ |
| gda_dashboard_intel_cache | 40 | 40 | ✓ |
| daily_trends | 703 | 703 | ✓ |
| gda_opportunity_alerts | 7 | 7 | ✓ |
| gda_morning_briefings | 40 | 40 | ✓ |
| gda_learned_weights | 24 | 24 | ✓ |
| gda_win_loss | 7 | 7 | ✓ |
| gda_error_log | 334 | 334 | ✓ |
| gda_saved_opportunities | 1 | 0 | ✓ (empty, is_called=false) |
| gda_teaming_partners | 13 | 13 | ✓ |
| gda_embeddings | 860 | 860 | ✓ |
| govtribe_cache | 1 | 0 | ✓ (empty, is_called=false) |
| gda_wargames | 1 | 1 | ✓ |
| gda_win_loss_db | 10 | 10 | ✓ |
| gda_contacts | 3 | 3 | ✓ |
| gda_trend_arrays | — | — | N/A (VARCHAR PK, no sequence) |

**All 27 SERIAL-PK tables: seq >= MAX(id).** No sequence will produce duplicate PKs.

### 7f. pgvector Index Queryability

```sql
SELECT id, 1 - (embedding <=> (SELECT embedding FROM gda_embeddings LIMIT 1)) AS similarity
FROM gda_embeddings
ORDER BY embedding <=> (SELECT embedding FROM gda_embeddings LIMIT 1)
LIMIT 3;

 id  |     similarity
-----+--------------------
   2 |                  1     -- self-match = 1.0 ✓
 252 | 0.7682018329675984
 257 | 0.7142904138198558
```

IVFFlat index on gda_embeddings is built and queryable. First row similarity = 1.0 (self-match) as expected.

## Pass 2 — Post-Truncate Re-run (Section 9f)

**Timestamp:** 2026-05-22T19:30:46Z  
**Log:** `/var/log/f026-step3-migration-staging-20260522T193046Z.log`

| Result | Count |
|--------|-------|
| **Copied** | 28 |
| **Skipped** | 0 |
| **Failed** | 0 |
| **Exit code** | 0 |

Pass 2 results match Pass 1 exactly: 28 copied, 0 skipped, 0 failed, identical row counts.

## Pass 3 — Idempotency Proof (Section 9g)

**Timestamp:** 2026-05-22T19:32:53Z  
**Log:** `/var/log/f026-step3-migration-staging-20260522T193253Z.log`

| Result | Count |
|--------|-------|
| **Copied** | 0 |
| **Skipped** | 28 |
| **Failed** | 0 |
| **Exit code** | 0 |

All 28 tables reported SKIPPED:
- 24 tables: "target count N == source count N"
- 4 tables: "both source and target empty" (gda_relationships, gda_touchpoints, gda_saved_opportunities, govtribe_cache)

**Zero copies, zero errors, zero changes. True idempotency confirmed.**

## Script Bug Fixes During Rehearsal

Two bugs discovered and fixed during staging rehearsal:

### 1. SEQUENCE SET name mismatch (gda_risk_register)

**Root cause:** F-023b renamed `risk_register` → `gda_risk_register` but the source DB's sequence retained the old name `risk_register_id_seq`. pg_dump captures a `setval('risk_register_id_seq', ...)` call which fails on the target where the sequence is `gda_risk_register_id_seq`.

**Fix:** Filter out all SEQUENCE SET entries from pg_restore using `--list` + `grep -v 'SEQUENCE SET'` + `--use-list`. Safe because the script performs its own sequence sync (3-arg setval) after each table restore.

### 2. setval value 0 out of bounds (gda_competitor_cache)

**Root cause:** `gda_competitor_cache` has a row with `id=0`. `COALESCE(MAX(id), 1)` returns 0 (not NULL), and PostgreSQL sequences have `minvalue=1`, so `setval(seq, 0)` errors.

**Fix:** Use `GREATEST(COALESCE(MAX(id), 1), 1)` to ensure the value passed to setval is never below the sequence's minimum. Also adjusts `is_called` parameter accordingly.

### 3. Empty table idempotency (decision tree ordering)

**Root cause:** Tables with source=0 and target=0 hit the `target_count==0 → COPY` branch before the `target==source → SKIP` check, causing them to be "copied" (as empty dumps) instead of skipped on re-runs.

**Fix:** Reordered decision tree: check `target==source` first (including 0==0), then `target==0`, then HALT.

## Halt Condition Summary

| Condition | Status |
|-----------|--------|
| Pass 2 results differ from Pass 1 | NOT triggered ✓ |
| Pass 3 reports any table copied | NOT triggered ✓ |
| Any sequence < MAX(id) | NOT triggered ✓ |
| pgvector similarity != 1.0 for self-match | NOT triggered ✓ |
| Any FK orphan | NOT triggered ✓ |
| Writer workflow inventory ambiguity | NOT triggered ✓ |
| Refresh-staging failure | NOT triggered ✓ |
