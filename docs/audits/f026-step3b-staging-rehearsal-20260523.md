# F-026 Step 3b — Staging Rehearsal Report

**Date:** 2026-05-23  
**Operator:** devin-manual-apply  
**Plan reference:** docs/runbooks/f026-step3b-plan.md (PR #299)  
**Script:** scripts/f026/step3b-data-migration.sh  
**Target:** gda-postgres-staging / gda_command_staging (via `--target=staging`)

---

## Staging Environment Preparation

1. **Refresh staging:** `/root/refresh-staging.sh` — n8n_staging and gda_command_staging
   primed from production at 2026-05-23T12:41:23Z.
2. **Verify parity:** n8n: 156/156 tables, gda_command: 114/114 tables,
   gda_opportunity_tracker: 1780/1780, gda_embeddings: 821/821, sam_opportunities: 13734/13734.
3. **Apply migrations 085–114:** All 30 CREATE TABLE migrations applied successfully.
   `schema_migrations` count advanced from 88 → 118.
4. **Pre-run state:** All 30 target tables exist on gda_command_staging with 0 rows each.

---

## Pass 1 — Fresh (2026-05-23T12:43:39Z)

| # | Table | Decision | Source | Target | Match? |
|---|-------|----------|--------|--------|--------|
| 1 | gda_action_history | COPY | 54 | 54 | ✓ |
| 2 | gda_ai_feedback | SKIP (0==0) | 0 | 0 | ✓ |
| 3 | gda_aop_tracker | COPY | 12 | 12 | ✓ |
| 4 | gda_approval_queue | SKIP (0==0) | 0 | 0 | ✓ |
| 5 | gda_capture_lessons | SKIP (0==0) | 0 | 0 | ✓ |
| 6 | gda_chat_history | COPY | 52 | 52 | ✓ |
| 7 | gda_clause_library | COPY | 18 | 18 | ✓ |
| 8 | gda_competitor_crawls | COPY | 31 | 31 | ✓ |
| 9 | gda_compliance_matrices | COPY | 8 | 8 | ✓ |
| 10 | gda_contract_vehicles | COPY | 2 | 2 | ✓ |
| 11 | gda_daily_briefings | COPY | 60 | 60 | ✓ |
| 12 | gda_daily_briefs | COPY | 14 | 14 | ✓ |
| 13 | gda_deep_research | COPY | 12 | 12 | ✓ |
| 14 | gda_dept_market | COPY | 8 | 8 | ✓ |
| 15 | gda_discussions | SKIP (0==0) | 0 | 0 | ✓ |
| 16 | gda_doc_inbox | SKIP (0==0) | 0 | 0 | ✓ |
| 17 | gda_e2e_reports | COPY | 268 | 268 | ✓ |
| 18 | gda_feedback | COPY | 8 | 8 | ✓ |
| 19 | gda_health_scans | COPY | 30 | 30 | ✓ |
| 20 | gda_idiq_tracker | COPY | 21 | 21 | ✓ |
| 21 | gda_incumbent_analysis | COPY | 18 | 18 | ✓ |
| 22 | gda_knowledge_base | COPY | 4 | 4 | ✓ |
| 23 | gda_learning_log | COPY | 331 | 331 | ✓ |
| 24 | gda_meeting_notes | COPY | 43 | 43 | ✓ |
| 25 | gda_mega_cache | COPY | 1 | 1 | ✓ |
| 26 | gda_naics_tracking | SKIP (0==0) | 0 | 0 | ✓ |
| 27 | gda_ndaa_intel | COPY | 14 | 14 | ✓ |
| 28 | gda_ooda_loops | COPY | 3 | 3 | ✓ |
| 29 | gda_prompt_architect_memory | SKIP (0==0) | 0 | 0 | ✓ |
| 30 | gda_pwin_scores | COPY | 12 | 12 | ✓ |

**Summary:** 23 copied, 7 skipped (empty), 0 failed. **1,024 total rows.**

---

## Pass 2 — Post-Truncate (2026-05-23T12:45:04Z)

All 30 tables truncated on gda_command_staging before re-run.

**Summary:** 23 copied, 7 skipped (empty), 0 failed. **1,024 total rows.**  
All row counts and sequence values match Pass 1 exactly.

---

## Pass 3 — Idempotency (2026-05-23T12:46:17Z)

No truncate — re-run on populated target.

**Summary:** 0 copied, 30 skipped, 0 failed. Exit 0.  
Every table hit the `target==source` SKIP branch. Idempotency **proven**.

---

## Constraint Verification (all 3 passes)

### Sequence Sync (28 SERIAL tables)

| Table | Sequence Value | MAX(id) | PASS? |
|-------|---------------|---------|-------|
| gda_action_history | 61 | 61 | ✓ |
| gda_aop_tracker | 12 | 12 | ✓ |
| gda_chat_history | 52 | 52 | ✓ |
| gda_clause_library | 18 | 18 | ✓ |
| gda_competitor_crawls | 31 | 31 | ✓ |
| gda_compliance_matrices | 8 | 8 | ✓ |
| gda_contract_vehicles | 2 | 2 | ✓ |
| gda_daily_briefings | 60 | 60 | ✓ |
| gda_daily_briefs | 14 | 14 | ✓ |
| gda_deep_research | 12 | 12 | ✓ |
| gda_dept_market | 8 | 8 | ✓ |
| gda_discussions | 1 (is_called=false) | — | ✓ |
| gda_doc_inbox | 1 (is_called=false) | — | ✓ |
| gda_e2e_reports | 268 | 268 | ✓ |
| gda_feedback | 8 | 8 | ✓ |
| gda_health_scans | 30 | 30 | ✓ |
| gda_idiq_tracker | 21 | 21 | ✓ |
| gda_incumbent_analysis | 18 | 18 | ✓ |
| gda_knowledge_base | 4 | 4 | ✓ |
| gda_learning_log | 331 | 331 | ✓ |
| gda_meeting_notes | 43 | 43 | ✓ |
| gda_naics_tracking | 1 (is_called=false) | — | ✓ |
| gda_ndaa_intel | 14 | 14 | ✓ |
| gda_ooda_loops | 3 | 3 | ✓ |
| gda_prompt_architect_memory | 1 (is_called=false) | — | ✓ |
| gda_pwin_scores | 12 | 12 | ✓ |
| gda_ai_feedback | 1 (is_called=false) | — | ✓ |
| gda_capture_lessons | 1 (is_called=false) | — | ✓ |

**28/28 PASS.** Skipped: gda_approval_queue (UUID PK), gda_mega_cache (manual integer PK).

### UNIQUE Constraint Checks (8 tables)

| Table | Constraint | Duplicates | PASS? |
|-------|-----------|------------|-------|
| gda_aop_tracker | ou, fiscal_year, quarter | 0 | ✓ |
| gda_clause_library | clause_number | 0 | ✓ |
| gda_contract_vehicles | contract_number | 0 | ✓ |
| gda_dept_market | dept | 0 | ✓ |
| gda_idiq_tracker | contract_number | 0 | ✓ |
| gda_incumbent_analysis | agency, vendor_name | 0 | ✓ |
| gda_naics_tracking | company, month | 0 | ✓ |
| gda_ndaa_intel | section, source_type | 0 | ✓ |

**8/8 PASS.**

### CHECK Constraint Checks (2 tables, 5 constraints)

| Table | Constraint | Violations | PASS? |
|-------|-----------|------------|-------|
| gda_ai_feedback | user_action_check | 0 | ✓ |
| gda_idiq_tracker | gda_position_check | 0 | ✓ |
| gda_idiq_tracker | gda_prime_or_sub_check | 0 | ✓ |
| gda_idiq_tracker | on_ramp_status_check | 0 | ✓ |
| gda_idiq_tracker | vehicle_type_check | 0 | ✓ |

**5/5 PASS.**

---

## Writer Inventory Verification

Cross-checked all 40 writer workflows from plan Section 5a against current n8n state:

- **40/40 found** — all exist on n8n-envision-n8n-1
- **40/40 active** — all have `active=True`
- **0 renamed, 0 deactivated, 0 deleted** since plan was written
- Names match plan inventory exactly

---

## Row Count Delta vs Plan Estimate

| Source | Total Rows | Non-Empty Tables |
|--------|-----------|------------------|
| PR #298 Section 0a (2026-05-22) | ~81 | 7 |
| PR #299 plan (2026-05-23) | ~1,024 | 18 |
| This rehearsal (2026-05-23) | 1,024 | 23 |

Row count grew ~12x between PR #298 and PR #299 estimate due to continued workflow
writes (especially gda_learning_log: 331, gda_e2e_reports: 268). Non-empty table
count grew from plan estimate of 18 to actual 23 — 5 additional tables received
writes between plan creation and rehearsal. Per architect decision 12c, this delta
will be surfaced in the PR #4 description.

---

## Bugs Found During Rehearsal

### Bug 1: schema_migrations column name mismatch

**Issue:** Initial migration apply used `INSERT INTO schema_migrations (filename, ...)`
but the actual column is `name`, not `filename`.

**Fix:** Updated to use `(name, applied_at, applied_by)`. Not a script bug — this was
operator error during manual migration apply. The data migration script itself does not
touch schema_migrations (that's the backend's job on startup).

**Impact:** None on script or production. Manual-apply procedure corrected in rehearsal.

---

## Halt Condition Verification

All plan Section 9 halt conditions verified **NOT triggered**:

| # | Condition | Status |
|---|-----------|--------|
| 1 | Step 3 closure state not intact | NOT TRIGGERED |
| 2 | schema_migrations ≠ expected | NOT TRIGGERED (88 pre-apply, 118 post-apply) |
| 3 | Any of 30 tables missing from n8n DB | NOT TRIGGERED |
| 4 | gda-backend not healthy | NOT TRIGGERED |
| 5 | pg_dump fails for any table | NOT TRIGGERED |
| 6 | pg_restore fails for any table | NOT TRIGGERED |
| 7 | Row count mismatch after copy | NOT TRIGGERED |
| 8 | UNIQUE constraint violation | NOT TRIGGERED (8/8 pass) |
| 9 | CHECK constraint violation | NOT TRIGGERED (5/5 pass) |
| 10 | Sequence sync fails | NOT TRIGGERED (28/28 pass) |
| 11 | Idempotency pass shows non-zero copies | NOT TRIGGERED (0 copied, 30 skipped) |
| 12 | Row count delta between passes | NOT TRIGGERED (Pass 1 == Pass 2) |
| 13 | Extension dependency failure | NOT TRIGGERED (no pgvector in 30 tables) |
| 14 | FK constraint violation | NOT TRIGGERED (0 FKs among 30 tables) |
| 15 | Post-resume workflow non-success | N/A (staging — no live workflows to resume) |

---

## Conclusion

**3-pass staging rehearsal: PASS.** Script, migrations, and constraint checks all
verified. Ready for architect review before Step 3b PR 3 (prod schema apply).

**No production state has been changed.**
