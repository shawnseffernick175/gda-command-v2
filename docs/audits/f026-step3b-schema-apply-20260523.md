# F-026 Step 3b — Production Schema Apply Record

**Date:** 2026-05-23  
**Operator:** devin-manual-apply  
**Plan reference:** docs/runbooks/f026-step3b-plan.md (PR #299)  
**Migrations:** 085_step3b_gda_action_history.sql → 114_step3b_gda_pwin_scores.sql (30 files)  
**Target:** gda-postgres / gda_command (production)

---

## Pre-Apply State

| Check | Expected | Actual | PASS? |
|-------|----------|--------|-------|
| gda-postgres container | running healthy | running healthy | ✓ |
| gda_command reachable | yes | yes | ✓ |
| schema_migrations count | 88 | 88 | ✓ |
| 30 Step 3b tables exist | none | none | ✓ |
| gda-backend health | 200 | 200 | ✓ |
| Migration file count | 30 | 30 | ✓ |

---

## Apply Log

All 30 migrations applied via `docker exec gda-postgres psql -U gda -d gda_command -1 -f`.
Each wrapped in single-transaction (`-1`). schema_migrations row inserted after each.

| # | Migration | Start (UTC) | Duration | Exit |
|---|-----------|-------------|----------|------|
| 1 | 085_step3b_gda_action_history.sql | 14:30:20 | 219ms | 0 |
| 2 | 086_step3b_gda_ai_feedback.sql | 14:30:20 | 189ms | 0 |
| 3 | 087_step3b_gda_aop_tracker.sql | 14:30:21 | 179ms | 0 |
| 4 | 088_step3b_gda_approval_queue.sql | 14:30:21 | 165ms | 0 |
| 5 | 089_step3b_gda_capture_lessons.sql | 14:30:21 | 171ms | 0 |
| 6 | 090_step3b_gda_chat_history.sql | 14:30:21 | 162ms | 0 |
| 7 | 091_step3b_gda_clause_library.sql | 14:30:22 | 149ms | 0 |
| 8 | 092_step3b_gda_competitor_crawls.sql | 14:30:22 | 172ms | 0 |
| 9 | 093_step3b_gda_compliance_matrices.sql | 14:30:22 | 173ms | 0 |
| 10 | 094_step3b_gda_contract_vehicles.sql | 14:30:23 | 158ms | 0 |
| 11 | 095_step3b_gda_daily_briefings.sql | 14:30:23 | 176ms | 0 |
| 12 | 096_step3b_gda_daily_briefs.sql | 14:30:23 | 174ms | 0 |
| 13 | 097_step3b_gda_deep_research.sql | 14:30:24 | 181ms | 0 |
| 14 | 098_step3b_gda_dept_market.sql | 14:30:24 | 207ms | 0 |
| 15 | 099_step3b_gda_discussions.sql | 14:30:24 | 190ms | 0 |
| 16 | 100_step3b_gda_doc_inbox.sql | 14:30:25 | 168ms | 0 |
| 17 | 101_step3b_gda_e2e_reports.sql | 14:30:25 | 175ms | 0 |
| 18 | 102_step3b_gda_feedback.sql | 14:30:25 | 180ms | 0 |
| 19 | 103_step3b_gda_health_scans.sql | 14:30:25 | 182ms | 0 |
| 20 | 104_step3b_gda_idiq_tracker.sql | 14:30:26 | 174ms | 0 |
| 21 | 105_step3b_gda_incumbent_analysis.sql | 14:30:26 | 196ms | 0 |
| 22 | 106_step3b_gda_knowledge_base.sql | 14:30:26 | 177ms | 0 |
| 23 | 107_step3b_gda_learning_log.sql | 14:30:27 | 167ms | 0 |
| 24 | 108_step3b_gda_meeting_notes.sql | 14:30:27 | 161ms | 0 |
| 25 | 109_step3b_gda_mega_cache.sql | 14:30:27 | 215ms | 0 |
| 26 | 110_step3b_gda_naics_tracking.sql | 14:30:28 | 170ms | 0 |
| 27 | 111_step3b_gda_ndaa_intel.sql | 14:30:28 | 179ms | 0 |
| 28 | 112_step3b_gda_ooda_loops.sql | 14:30:28 | 162ms | 0 |
| 29 | 113_step3b_gda_prompt_architect_memory.sql | 14:30:29 | 167ms | 0 |
| 30 | 114_step3b_gda_pwin_scores.sql | 14:30:29 | 160ms | 0 |

**Total duration:** ~9 seconds. **0 failures.**

---

## Post-Apply Verification

### schema_migrations count
- Before: 88
- After: **118** (88 + 30) ✓

### All 30 tables exist
PASS — all 30 confirmed present on `public` schema of gda_command.

### Spot-Check: 088 — gda_approval_queue (UUID PK)
- `id uuid NOT NULL DEFAULT gen_random_uuid()` ✓
- PRIMARY KEY on `id` ✓
- No sequence (UUID, not SERIAL) ✓

### Spot-Check: 104 — gda_idiq_tracker (4 CHECK + UNIQUE)
- `id integer NOT NULL DEFAULT nextval('gda_idiq_tracker_id_seq')` ✓
- 4 CHECK constraints present:
  - `gda_idiq_tracker_gda_position_check` ✓
  - `gda_idiq_tracker_gda_prime_or_sub_check` ✓
  - `gda_idiq_tracker_on_ramp_status_check` ✓
  - `gda_idiq_tracker_vehicle_type_check` ✓
- UNIQUE constraint on `contract_number` ✓
- Sequence ownership ✓

### Spot-Check: 109 — gda_mega_cache (manual integer PK)
- `id integer NOT NULL` with NO default ✓ (architect decision 12a)
- No sequence attached ✓
- PRIMARY KEY on `id` ✓

### Sequence Ownership (28 SERIAL tables)
28/28 sequences properly owned by their respective tables. ✓

### gda-backend Health
- `curl -s gda.csr-llc.tech/health` → **200** ✓
- Backend was NOT restarted. Still running on pre-PR#288 code.

---

## Watchpoints

**Migration 109 (gda_mega_cache):** Applied cleanly. The `id INTEGER NOT NULL` with no
sequence/default was accepted by PostgreSQL without issue. No choke.

---

## Summary

Schema applied to prod. No data migrated yet. No workflows touched. Backend NOT restarted.

**30 empty tables now exist on gda_command**, ready for Step 3b PR 4 (prod data execution).

Existing application data (4,562 rows from Step 3) remains untouched.
