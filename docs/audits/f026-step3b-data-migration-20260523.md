# F-026 Step 3b — Production Data Migration Record

**Date:** 2026-05-23  
**Operator:** devin-manual-apply  
**Plan reference:** docs/runbooks/f026-step3b-plan.md (PR #299)  
**Script:** scripts/f026/step3b-data-migration.sh --target=prod  
**Source:** n8n-envision-postgres-1 / n8n (user: n8n)  
**Target:** gda-postgres / gda_command (user: gda)

---

## Pre-Flight State

| Check | Expected | Actual | PASS? |
|-------|----------|--------|-------|
| schema_migrations count | 118 | 118 | ✓ |
| 30 Step 3b tables exist | yes | yes | ✓ |
| 30 Step 3b tables empty | yes (0 rows each) | yes | ✓ |
| Step 3 ADOPT rows on gda_command | ~4,562 | 4,452 | ✓ (delta from retention crons) |
| gda-backend /health | 200 | 200 | ✓ |
| gda-postgres container | running healthy | running healthy | ✓ |
| n8n-envision-postgres-1 container | running | running | ✓ |

**ADOPT row delta note:** 4,452 vs original 4,562 (−110 rows). Difference from
`GDA.cron.data-retention` running since Step 3 execution — deletes expired rows from
`gda_action_history`, `gda_competitor_cache`, `gda_dashboard_intel_cache`, `gda_intelligence_log`.
Expected behavior, not a halt condition.

---

## Backup

| Field | Value |
|-------|-------|
| Command | `/root/backup-before-migration.sh gda_command` |
| File | `/root/backups/gda_command_2026-05-23T143701Z.dump` |
| Size | 7.9 MB (> 1.5 MB threshold) |

---

## Writer Pause

| Field | Value |
|-------|-------|
| Pause start (EST) | 2026-05-23 10:38:26 EDT |
| Pause start (UTC) | 2026-05-23T14:38:26Z |
| Workflows paused | 41 (40 writers + GDA.cron.change-detector) |
| Failed to pause | 0 |
| Canary (system-watchdog) | **NOT paused** — remained active |

### Paused Workflow IDs (41)

40 writers from plan Section 5a:
LzjiBI80aDAZgDIp, M0xPvRs31zQOewfx, bTE4k631s6JqZMiG, fZpqchmmPnqAmiMq,
i1aQWBr6qeG4TDOB, bPXzuxPpq8ClGdZ0, EGQzp92GxbjTJ03X, AqWz367raGvlgIhp,
xKR1NtwUUu5xOC6g, BLS36QTOznJ8mJlC, aCrxoe1rCuIbsnC4, 1OPkoA5e8DYVQKm1,
1aYt8mIzZ5duB3TX, 34M99tJpcYh4Qd43, 4fhTge7p4iIEDza9, 81m1Zl9xjM6L8HQb,
AZLL3i2lyMEsARaK, EeR3nC8l30Vdsu5b, FMYsT157mKuqn06v, Fn02pKArk2YcyQp5,
G9US1e01oY1cgJIF, GrbSQxeJs7ag6zXx, O4aAvY3mHxxGGJ0P, P8AfP8P84xi33auD,
PqJgzJkHM1BFWkwl, Qa0p2I5Qqi2lPeRN, QgperN6cuOpfnb09, SEJLE89wZa1yfQyB,
UYGJPu7N5YZblvEU, VsNvEyaS46M8uPgB, afjmc6tOjffkEC3k, f0OGkYCb5tvoOnpP,
jalin8peBLddjsEa, kZT3jlZn4lKfuhwh, pkPpMhiz8IdRy7To, q9YWVQCwnJGqmrO7,
rWVp9Hp1ZthoqpfA, uefArlmFlJYeXTJv, upEGGfu6dYIwr0tD, iJaZmAsI4GVvMySQ

Plus change-detector: Zb2quk78c5mszZ2C

---

## Data Migration

| Field | Value |
|-------|-------|
| Script start (UTC) | 2026-05-23T14:38:44Z |
| Script end (UTC) | 2026-05-23T14:39:37Z |
| Duration | ~53 seconds |
| Exit code | 0 |
| Tables copied | 23 |
| Tables skipped (empty) | 7 |
| Tables failed | 0 |
| Total rows migrated | **1,024** |

---

## Row Count Parity (30 tables)

| Table | Source (n8n) | Target (gda_command) | Match? |
|-------|-------------|---------------------|--------|
| gda_action_history | 54 | 54 | ✓ |
| gda_ai_feedback | 0 | 0 | ✓ |
| gda_aop_tracker | 12 | 12 | ✓ |
| gda_approval_queue | 0 | 0 | ✓ |
| gda_capture_lessons | 0 | 0 | ✓ |
| gda_chat_history | 52 | 52 | ✓ |
| gda_clause_library | 18 | 18 | ✓ |
| gda_competitor_crawls | 31 | 31 | ✓ |
| gda_compliance_matrices | 8 | 8 | ✓ |
| gda_contract_vehicles | 2 | 2 | ✓ |
| gda_daily_briefings | 60 | 60 | ✓ |
| gda_daily_briefs | 14 | 14 | ✓ |
| gda_deep_research | 12 | 12 | ✓ |
| gda_dept_market | 8 | 8 | ✓ |
| gda_discussions | 0 | 0 | ✓ |
| gda_doc_inbox | 0 | 0 | ✓ |
| gda_e2e_reports | 268 | 268 | ✓ |
| gda_feedback | 8 | 8 | ✓ |
| gda_health_scans | 30 | 30 | ✓ |
| gda_idiq_tracker | 21 | 21 | ✓ |
| gda_incumbent_analysis | 18 | 18 | ✓ |
| gda_knowledge_base | 4 | 4 | ✓ |
| gda_learning_log | 331 | 331 | ✓ |
| gda_meeting_notes | 43 | 43 | ✓ |
| gda_mega_cache | 1 | 1 | ✓ |
| gda_naics_tracking | 0 | 0 | ✓ |
| gda_ndaa_intel | 14 | 14 | ✓ |
| gda_ooda_loops | 3 | 3 | ✓ |
| gda_prompt_architect_memory | 0 | 0 | ✓ |
| gda_pwin_scores | 12 | 12 | ✓ |
| **TOTAL** | **1,024** | **1,024** | **✓** |

**0 mismatches. 30/30 parity confirmed.**

---

## Constraint Verification

### Sequence Sync (28/28 PASS)

Script verified all 28 SERIAL sequences. Spot-check of 5:

| Table | Sequence Value | MAX(id) | PASS? |
|-------|---------------|---------|-------|
| gda_action_history | 61 | 61 | ✓ |
| gda_e2e_reports | 268 | 268 | ✓ |
| gda_learning_log | 331 | 331 | ✓ |
| gda_idiq_tracker | 21 | 21 | ✓ |
| gda_daily_briefings | 69 | 69 | ✓ |

Skipped (no SERIAL): gda_approval_queue (UUID PK), gda_mega_cache (manual integer PK).

### UUID Table: gda_approval_queue
- Source: 0, Target: 0 — **parity OK** (empty on both sides)

### Manual Integer PK: gda_mega_cache
- Count: 1/1 parity OK
- `id=1` on both source and target — **hardcoded value preserved**

### UNIQUE Constraints (8/8 PASS)

| Table | Constraint | Duplicates |
|-------|-----------|------------|
| gda_aop_tracker | ou, fiscal_year, quarter | 0 |
| gda_clause_library | clause_number | 0 |
| gda_contract_vehicles | contract_number | 0 |
| gda_dept_market | dept | 0 |
| gda_idiq_tracker | contract_number | 0 |
| gda_incumbent_analysis | agency, vendor_name | 0 |
| gda_naics_tracking | company, month | 0 |
| gda_ndaa_intel | section, source_type | 0 |

### CHECK Constraints (5/5 PASS)

| Table | Constraint | Violations |
|-------|-----------|------------|
| gda_ai_feedback | user_action_check | 0 |
| gda_idiq_tracker | gda_position_check | 0 |
| gda_idiq_tracker | gda_prime_or_sub_check | 0 |
| gda_idiq_tracker | on_ramp_status_check | 0 |
| gda_idiq_tracker | vehicle_type_check | 0 |

---

## Writer Unpause

| Field | Value |
|-------|-------|
| Unpause start (EST) | 2026-05-23 10:41:22 EDT |
| Unpause end (EST) | 2026-05-23 10:41:28 EDT |
| Workflows resumed | 41/41 |
| Failed to resume | 0 |

### Total Pause Window
- Start: 10:38:26 EDT
- End: 10:41:28 EDT
- **Duration: ~3 minutes 2 seconds**

---

## Post-Execution Health

| Check | Expected | Actual | PASS? |
|-------|----------|--------|-------|
| gda-backend /health | 200 | 200 | ✓ |
| gda-postgres | running healthy | running healthy | ✓ |
| system-watchdog last success | within 10 min | 14:40:57Z (~1 min ago) | ✓ |
| change-detector active | true | true | ✓ |

---

## Summary

| Metric | Value |
|--------|-------|
| Tables migrated | 30 (23 with data, 7 empty) |
| Total rows | 1,024 |
| Row count mismatches | 0 |
| Sequence checks | 28/28 PASS |
| UNIQUE checks | 8/8 PASS |
| CHECK checks | 5/5 PASS |
| FK orphans | 0 (no FKs among 30 tables) |
| pgvector tables | 0 |
| Pause window | ~3 min 2 sec |
| Script exit code | 0 |
| Halt conditions triggered | 0 |
| Backend restarted | NO |
| Credentials touched | NO |
| n8n DB modified | NO |

**Production data migration complete.** 1,024 rows across 30 tables now live on
gda-postgres/gda_command alongside the 4,452 existing ADOPT rows. All 58 tables
referenced by the 122 HwronxMmGY5XDGEt workflows now exist on gda_command.

Step 3b is **CLOSED**. Step 4 PR 2 (credential cutover) gate condition is met.
