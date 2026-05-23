# F-026 Step 3b — Data Migration: 30 N8N-ONLY Tables → gda_command

**Author:** Devin
**Date:** 2026-05-23
**Status:** DRAFT — awaiting architect review
**Parent issue:** F-026 (DB consolidation)
**Prerequisite PRs:** #294 (Step 3 plan), #295 (Step 3 script + rehearsal), #296 (schema apply), #297 (prod data execution), #298 (Step 4 plan — Section 0 halt-gate identified these 30 tables)

---

## 1. Preconditions

Before execution, verify each of the following. HALT on any failure.

### 1a. Step 3 closure state

| Check | Expected |
|-------|----------|
| gda_command ADOPT tables | 28 tables populated |
| gda_command total ADOPT rows | 4,562 (Step 3 parity) |
| FK integrity | 0 orphans (both chains) |
| Sequence sync | All 27 SERIAL-PK tables seq >= MAX(id) |
| pgvector self-match | similarity = 1.0 on gda_embeddings |

### 1b. Schema state (pre-PR 3 — schema apply)

| Check | Expected |
|-------|----------|
| schema_migrations count | 88 |
| Latest migration | `055_govwin_wsapi_integration.sql` (highest applied; 056-084 are manual-apply tagged) |
| 30 target tables on gda_command | All must NOT exist (Step 3b PR 3 creates them) |

### 1b′. Schema state (pre-PR 4 — data execution)

> **Note:** By PR 4 execution time, PR 3 has already applied migrations 085-114.
> Phase A of Section 8 uses these checks instead of 1b.

| Check | Expected |
|-------|----------|
| schema_migrations count | 118 (88 + 30) |
| Latest migration | `114_step3b_gda_pwin_scores.sql` |
| 30 target tables on gda_command | All EXIST and have 0 rows (empty, awaiting data copy) |

### 1c. Source data integrity

| Check | Expected |
|-------|----------|
| 30 source tables on n8n DB | All exist with rows matching pre-migration snapshot |
| n8n-envision-postgres-1 | Running and healthy |

### 1d. System health

| Check | Expected |
|-------|----------|
| gda-postgres | Running and healthy |
| gda-backend | Running, healthy (200 on gda.csr-llc.tech/health) |
| gda-backend code | Still pre-PR#288 (do NOT restart) |

---

## 2. Scope

### 2a. Tables (30)

| # | Table | Cols | Rows | Size | PK Type | Indexes | UNIQUE | CHECK | JSONB Cols | text[] Cols |
|---|-------|------|------|------|---------|---------|--------|-------|------------|-------------|
| 1 | gda_action_history | 9 | 54 | 200 kB | SERIAL | 4 | — | — | 2 | — |
| 2 | gda_ai_feedback | 8 | 0 | 16 kB | SERIAL | 1 | — | 1 | — | — |
| 3 | gda_aop_tracker | 22 | 12 | 80 kB | SERIAL | 2 | 1 | — | — | — |
| 4 | gda_approval_queue | 10 | 0 | 16 kB | UUID | 1 | — | — | 1 | — |
| 5 | gda_capture_lessons | 12 | 0 | 16 kB | SERIAL | 1 | — | — | 2 | — |
| 6 | gda_chat_history | 5 | 52 | 72 kB | SERIAL | 1 | — | — | — | — |
| 7 | gda_clause_library | 7 | 18 | 80 kB | SERIAL | 2 | 1 | — | — | — |
| 8 | gda_competitor_crawls | 8 | 31 | 176 kB | SERIAL | 1 | — | — | 2 | — |
| 9 | gda_compliance_matrices | 6 | 8 | 136 kB | SERIAL | 1 | — | — | 1 | — |
| 10 | gda_contract_vehicles | 26 | 2 | 80 kB | SERIAL | 2 | 1 | — | — | — |
| 11 | gda_daily_briefings | 4 | 60 | 512 kB | SERIAL | 2 | — | — | 1 | — |
| 12 | gda_daily_briefs | 5 | 14 | 120 kB | SERIAL | 1 | — | — | 2 | — |
| 13 | gda_deep_research | 10 | 12 | 136 kB | SERIAL | 1 | — | — | 2 | — |
| 14 | gda_dept_market | 10 | 8 | 80 kB | SERIAL | 2 | 1 | — | — | — |
| 15 | gda_discussions | 9 | 0 | 16 kB | SERIAL | 1 | — | — | — | 1 |
| 16 | gda_doc_inbox | 13 | 0 | 16 kB | SERIAL | 1 | — | — | 1 | — |
| 17 | gda_e2e_reports | 10 | 268 | 432 kB | SERIAL | 1 | — | — | 1 | — |
| 18 | gda_feedback | 7 | 8 | 64 kB | SERIAL | 3 | — | — | 1 | — |
| 19 | gda_health_scans | 10 | 30 | 96 kB | SERIAL | 1 | — | — | 1 | — |
| 20 | gda_idiq_tracker | 26 | 21 | 88 kB | SERIAL | 2 | 1 | 4 | — | 4 |
| 21 | gda_incumbent_analysis | 10 | 18 | 80 kB | SERIAL | 2 | 1 | — | — | — |
| 22 | gda_knowledge_base | 7 | 4 | 128 kB | SERIAL | 3 | — | — | 1 | 1 |
| 23 | gda_learning_log | 8 | 331 | 96 kB | SERIAL | 1 | — | — | 1 | 1 |
| 24 | gda_meeting_notes | 15 | 43 | 120 kB | SERIAL | 1 | — | — | 6 | — |
| 25 | gda_mega_cache | 3 | 1 | 208 kB | INTEGER (manual) | 1 | — | — | — | — |
| 26 | gda_naics_tracking | 8 | 0 | 24 kB | SERIAL | 2 | 1 | — | — | — |
| 27 | gda_ndaa_intel | 8 | 14 | 80 kB | SERIAL | 2 | 1 | — | — | — |
| 28 | gda_ooda_loops | 9 | 3 | 216 kB | SERIAL | 3 | — | — | 4 | — |
| 29 | gda_prompt_architect_memory | 4 | 0 | 16 kB | SERIAL | 1 | — | — | 1 | — |
| 30 | gda_pwin_scores | 13 | 12 | 104 kB | SERIAL | 3 | — | — | 3 | — |
| | **TOTAL** | | **1,024** | **~3.2 MB** | | **50** | **8** | **5** | **33** | **7** |

> **Row count note:** These counts are from the live n8n DB as of 2026-05-23.
> The PR #298 snapshot showed ~81 rows because it used a point-in-time estimate.
> Workflows have continued writing since then — notably gda_e2e_reports (27→268),
> gda_learning_log (0→331), gda_action_history (6→54), gda_chat_history (6→52).
> The pre-migration snapshot (Section 8, step 5) captures the authoritative count.

### 2b. FK relationships

**NONE.** The FK constraint query returned zero results. Specifically:

- 0 FK relationships among the 30 tables
- 0 FK relationships from the 30 into the 28 ADOPT tables
- 0 FK relationships from the 30 to any out-of-scope table
- 0 FK relationships from any external table into the 30

**Implication:** Insert order is irrelevant. Tables can be migrated in any order.
No FK integrity check needed (unlike Step 3's `gda_touchpoints → gda_relationships`
and `ft_opportunity_signal → ft_signal_source` chains).

### 2c. Extension dependencies

| Extension | Used by | Status on gda-postgres |
|-----------|---------|----------------------|
| pgvector | **NONE** of the 30 tables | Installed (v0.8.2) but not needed |
| uuid-ossp / pgcrypto | gda_approval_queue (UUID PK with gen_random_uuid()) | gen_random_uuid() is built-in since PostgreSQL 13 |
| GIN indexes | gda_knowledge_base (tags column) | Standard PostgreSQL, no extension needed |

**No extension-related HALT conditions.**

### 2d. Sequence inventory

| # | Table | Sequence | PK Type |
|---|-------|----------|---------|
| 1 | gda_action_history | gda_action_history_id_seq | SERIAL |
| 2 | gda_ai_feedback | gda_ai_feedback_id_seq | SERIAL |
| 3 | gda_aop_tracker | gda_aop_tracker_id_seq | SERIAL |
| 4 | gda_approval_queue | — | UUID (gen_random_uuid()) |
| 5 | gda_capture_lessons | gda_capture_lessons_id_seq | SERIAL |
| 6 | gda_chat_history | gda_chat_history_id_seq | SERIAL |
| 7 | gda_clause_library | gda_clause_library_id_seq | SERIAL |
| 8 | gda_competitor_crawls | gda_competitor_crawls_id_seq | SERIAL |
| 9 | gda_compliance_matrices | gda_compliance_matrices_id_seq | SERIAL |
| 10 | gda_contract_vehicles | gda_contract_vehicles_id_seq | SERIAL |
| 11 | gda_daily_briefings | gda_daily_briefings_id_seq | SERIAL |
| 12 | gda_daily_briefs | gda_daily_briefs_id_seq | SERIAL |
| 13 | gda_deep_research | gda_deep_research_id_seq | SERIAL |
| 14 | gda_dept_market | gda_dept_market_id_seq | SERIAL |
| 15 | gda_discussions | gda_discussions_id_seq | SERIAL |
| 16 | gda_doc_inbox | gda_doc_inbox_id_seq | SERIAL |
| 17 | gda_e2e_reports | gda_e2e_reports_id_seq | SERIAL |
| 18 | gda_feedback | gda_feedback_id_seq | SERIAL |
| 19 | gda_health_scans | gda_health_scans_id_seq | SERIAL |
| 20 | gda_idiq_tracker | gda_idiq_tracker_id_seq | SERIAL |
| 21 | gda_incumbent_analysis | gda_incumbent_analysis_id_seq | SERIAL |
| 22 | gda_knowledge_base | gda_knowledge_base_id_seq | SERIAL |
| 23 | gda_learning_log | gda_learning_log_id_seq | SERIAL |
| 24 | gda_meeting_notes | gda_meeting_notes_id_seq | SERIAL |
| 25 | gda_mega_cache | — | INTEGER (no sequence, manual assignment) |
| 26 | gda_naics_tracking | gda_naics_tracking_id_seq | SERIAL |
| 27 | gda_ndaa_intel | gda_ndaa_intel_id_seq | SERIAL |
| 28 | gda_ooda_loops | gda_ooda_loops_id_seq | SERIAL |
| 29 | gda_prompt_architect_memory | gda_prompt_architect_memory_id_seq | SERIAL |
| 30 | gda_pwin_scores | gda_pwin_scores_id_seq | SERIAL |

**28 SERIAL sequences** require setval after data copy. 1 UUID PK (no sequence).
1 manual integer PK (gda_mega_cache — no default sequence; id=1 exists, no setval needed
unless rows are added during migration).

### 2e. CHECK constraints

| Table | Constraint | Values |
|-------|-----------|--------|
| gda_ai_feedback | gda_ai_feedback_user_action_check | accept, reject, modify, defer, flag |
| gda_idiq_tracker | gda_idiq_tracker_gda_position_check | holder, teaming, targeting |
| gda_idiq_tracker | gda_idiq_tracker_gda_prime_or_sub_check | prime, sub, either |
| gda_idiq_tracker | gda_idiq_tracker_on_ramp_status_check | none, open, closed, upcoming |
| gda_idiq_tracker | gda_idiq_tracker_vehicle_type_check | IDIQ, BPA, GWAC, MAC, SA-IDIQ |

### 2f. UNIQUE constraints

| Table | Constraint | Columns |
|-------|-----------|---------|
| gda_aop_tracker | gda_aop_tracker_ou_fiscal_year_quarter_key | (ou, fiscal_year, quarter) |
| gda_clause_library | gda_clause_library_clause_number_key | (clause_number) |
| gda_contract_vehicles | gda_contract_vehicles_contract_number_key | (contract_number) |
| gda_dept_market | gda_dept_market_dept_key | (dept) |
| gda_idiq_tracker | gda_idiq_tracker_contract_number_key | (contract_number) |
| gda_incumbent_analysis | gda_incumbent_analysis_agency_vendor_name_key | (agency, vendor_name) |
| gda_naics_tracking | gda_naics_tracking_company_month_key | (company, month) |
| gda_ndaa_intel | gda_ndaa_intel_section_source_type_key | (section, source_type) |

---

## 3. Approach

### 3a. Script decision: parallel script (recommended)

**Option A: Parameterize existing script** — Modify `scripts/f026/step3-data-migration.sh`
to accept a table list argument. Pro: single script. Con: the Step 3 script has
Step 3-specific logic (FK-ordered insert, pgvector verification, the 28-table hardcoded
list). Parameterizing it adds complexity and regression risk to an already-proven script.

**Option B: Write a parallel script** — `scripts/f026/step3b-data-migration.sh` with the
same decision tree, idempotency logic, and halt conditions, but tailored to the 30-table
set. Pro: Step 3 script remains immutable (it passed production). Con: code duplication.

**Recommendation: Option B (parallel script).** The Step 3 script is proven and immutable.
Step 3b has meaningful structural differences:
- No FK ordering (vs Step 3's FK-ordered insert)
- No pgvector verification (vs Step 3's IVFFlat check)
- 28 SERIAL sequences + 1 UUID + 1 manual PK (vs Step 3's 27 SERIAL + 1 pgvector)
- CHECK constraints (Step 3 had none)
- `gda_mega_cache` has no sequence default (needs GREATEST clamp like `gda_competitor_cache`)

The script follows the same 3-way idempotency decision tree:
1. Target table has rows AND matches source → SKIP
2. Target table has rows AND does NOT match → HALT (unexpected state)
3. Target table is empty → COPY

### 3b. Data copy method

Same as Step 3: per-table `pg_dump --data-only --table=<table>` from n8n DB, pipe to
`pg_restore --single-transaction --no-owner --data-only` on gda_command.

Each table is its own transaction. A failure rolls back only that table.

### 3c. Sequence sync

After data copy, for each of the 28 SERIAL-PK tables:
```sql
SELECT setval(
  '<table>_id_seq',
  GREATEST(COALESCE((SELECT MAX(id) FROM <table>), 1), 1),
  (SELECT MAX(id) FROM <table>) IS NOT NULL AND (SELECT MAX(id) FROM <table>) >= 1
);
```

The 3-argument `setval` matches the Step 3 script pattern:
- For tables with data: `is_called = true` → next INSERT gets MAX(id)+1
- For empty tables: `is_called = false` → next INSERT gets 1 (not 2)
- The `GREATEST(..., 1)` clamp handles the `id=0` edge case discovered in Step 3

`gda_approval_queue` (UUID PK) and `gda_mega_cache` (manual integer PK) are skipped
for sequence sync.

---

## 4. Schema Migrations

### 4a. File naming

Continue from 085 (next slot after 084). Convention:
`085_step3b_<table_name>.sql` through `114_step3b_<table_name>.sql` (30 files).

### 4b. Group strategy: one file per table (recommended)

**Reasoning:** One-per-table gives clean rollback granularity (can DROP a single table
without affecting others) and matches the Step 3 pattern (migrations 057-084 were
one-per-table). The 30-file count is a minor inconvenience in the migrations directory
but the audit trail value is high.

### 4c. Migration requirements

Each migration file must:
1. Use `CREATE TABLE IF NOT EXISTS` for re-runnability
2. Include all columns with exact types, defaults, and constraints from the n8n source schema
3. Include all indexes (PRIMARY KEY, UNIQUE, btree, GIN)
4. Include all CHECK constraints
5. Include sequence ownership (`ALTER SEQUENCE ... OWNED BY ...`)
6. Be tagged `applied_by = 'devin-manual-apply'` when applied via psql (same as Step 3)

### 4d. Alphabetical ordering within the 085-114 range

Since there are no FK dependencies, tables are ordered alphabetically:

| Migration | Table |
|-----------|-------|
| 085 | gda_action_history |
| 086 | gda_ai_feedback |
| 087 | gda_aop_tracker |
| 088 | gda_approval_queue |
| 089 | gda_capture_lessons |
| 090 | gda_chat_history |
| 091 | gda_clause_library |
| 092 | gda_competitor_crawls |
| 093 | gda_compliance_matrices |
| 094 | gda_contract_vehicles |
| 095 | gda_daily_briefings |
| 096 | gda_daily_briefs |
| 097 | gda_deep_research |
| 098 | gda_dept_market |
| 099 | gda_discussions |
| 100 | gda_doc_inbox |
| 101 | gda_e2e_reports |
| 102 | gda_feedback |
| 103 | gda_health_scans |
| 104 | gda_idiq_tracker |
| 105 | gda_incumbent_analysis |
| 106 | gda_knowledge_base |
| 107 | gda_learning_log |
| 108 | gda_meeting_notes |
| 109 | gda_mega_cache |
| 110 | gda_naics_tracking |
| 111 | gda_ndaa_intel |
| 112 | gda_ooda_loops |
| 113 | gda_prompt_architect_memory |
| 114 | gda_pwin_scores |

---

## 5. Writer Pause Strategy

### 5a. Writer workflow inventory (40 workflows)

Cross-referencing the 30 tables against the 122 workflows using HwronxMmGY5XDGEt identified
**40 unique writer workflows** that INSERT, UPDATE, DELETE, or use DDL (CREATE TABLE IF NOT
EXISTS) against one or more of the 30 tables.

| # | Workflow | ID | Trigger | Tables Written | Write Type |
|---|----------|----|---------|---------------|------------|
| 1 | GDA.cron.data-retention | LzjiBI80aDAZgDIp | cron | gda_action_history, gda_prompt_architect_memory | DELETE |
| 2 | GDA.cron.data-sync | M0xPvRs31zQOewfx | cron | gda_ooda_loops | WRITE |
| 3 | GDA.cron.competitor-crawler | bTE4k631s6JqZMiG | cron | gda_competitor_crawls | DDL+INSERT |
| 4 | GDA.cron.learning-engine | fZpqchmmPnqAmiMq | cron | gda_feedback | READ+WRITE |
| 5 | GDA.cron.morning-intel-briefing | i1aQWBr6qeG4TDOB | cron | gda_daily_briefs | INSERT |
| 6 | GDA.cron.auto-index-docs | bPXzuxPpq8ClGdZ0 | cron | gda_doc_inbox | DDL+INSERT+UPDATE |
| 7 | GDA.cron.nightly-fy-revenue-calc | EGQzp92GxbjTJ03X | cron | gda_mega_cache | INSERT |
| 8 | GDA.sched.dept-market-refresh | AqWz367raGvlgIhp | schedule | gda_dept_market | DDL+INSERT |
| 9 | GDA.sched.idiq-to-monitor | xKR1NtwUUu5xOC6g | schedule | gda_idiq_tracker | DDL+WRITE |
| 10 | GDA.auto.e2e-gemini-report | BLS36QTOznJ8mJlC | cron | gda_e2e_reports | DDL+WRITE |
| 11 | GDA.auto.feedback-collector | aCrxoe1rCuIbsnC4 | cron | gda_feedback | DDL+INSERT |
| 12 | GDA.api.action-history | 1OPkoA5e8DYVQKm1 | webhook | gda_action_history | INSERT+DELETE |
| 13 | GDA.api.approvals-queue | 1aYt8mIzZ5duB3TX | webhook | gda_approval_queue | WRITE |
| 14 | GDA.api.meeting-notes 2 | 34M99tJpcYh4Qd43 | webhook | gda_meeting_notes | INSERT |
| 15 | GDA.api.idiq-tracker | 4fhTge7p4iIEDza9 | webhook | gda_idiq_tracker | DDL+INSERT+UPDATE |
| 16 | GDA.api.pwin-calculator | 81m1Zl9xjM6L8HQb | webhook | gda_pwin_scores | DDL+INSERT |
| 17 | GDA.api.clause-library | AZLL3i2lyMEsARaK | webhook | gda_clause_library | DDL+WRITE |
| 18 | GDA.api.ai-feedback | EeR3nC8l30Vdsu5b | webhook | gda_ai_feedback | INSERT |
| 19 | GDA.api.discussions | FMYsT157mKuqn06v | webhook | gda_discussions | DDL+WRITE |
| 20 | GDA.api.data-learn | Fn02pKArk2YcyQp5 | webhook | gda_learning_log | DDL+INSERT |
| 21 | GDA.api.sitrep 2 | G9US1e01oY1cgJIF | webhook | gda_daily_briefings | INSERT |
| 22 | GDA.api.launchpad | GrbSQxeJs7ag6zXx | webhook | gda_incumbent_analysis | WRITE |
| 23 | GDA.api.vehicle-tracker | O4aAvY3mHxxGGJ0P | webhook | gda_contract_vehicles | DDL+INSERT |
| 24 | GDA.api.aop-tracker | P8AfP8P84xi33auD | webhook | gda_aop_tracker | DDL+WRITE |
| 25 | GDA.api.e2e-reports | PqJgzJkHM1BFWkwl | webhook | gda_e2e_reports | WRITE |
| 26 | GDA.api.compliance-matrix | Qa0p2I5Qqi2lPeRN | webhook | gda_compliance_matrices | INSERT |
| 27 | GDA.api.capture-plan | QgperN6cuOpfnb09 | webhook | gda_capture_lessons | WRITE |
| 28 | GDA.api.opp-tracker 2 | SEJLE89wZa1yfQyB | webhook | gda_capture_lessons | INSERT |
| 29 | GDA.api.dashboard-mega | UYGJPu7N5YZblvEU | webhook | gda_mega_cache | INSERT |
| 30 | GDA.api.knowledge-base | VsNvEyaS46M8uPgB | webhook | gda_knowledge_base | DDL+WRITE |
| 31 | GDA.api.ndaa-far-ingest | afjmc6tOjffkEC3k | webhook | gda_ndaa_intel | DDL+WRITE |
| 32 | GDA.api.health-scan | f0OGkYCb5tvoOnpP | webhook | gda_health_scans | DDL+WRITE |
| 33 | GDA.api.agentic-chat | jalin8peBLddjsEa | webhook | gda_chat_history | DDL+INSERT |
| 34 | GDA.api.capture-hub | kZT3jlZn4lKfuhwh | webhook | gda_contract_vehicles, gda_dept_market, gda_ndaa_intel | UPDATE |
| 35 | GDA.api.ooda-loop 2 | pkPpMhiz8IdRy7To | webhook | gda_ooda_loops | WRITE |
| 36 | GDA.research.deep-research | q9YWVQCwnJGqmrO7 | webhook | gda_deep_research | DDL+WRITE |
| 37 | GDA.api.naics 2 | rWVp9Hp1ZthoqpfA | webhook | gda_naics_tracking | DDL+INSERT+DELETE |
| 38 | GDA.api.deep-research-history | uefArlmFlJYeXTJv | webhook | gda_deep_research | DDL+WRITE |
| 39 | GDA.api.daily-brief-reader | upEGGfu6dYIwr0tD | webhook | gda_daily_briefs | WRITE |
| 40 | GDA.form.quick-entry | iJaZmAsI4GVvMySQ | form | gda_doc_inbox | INSERT |

### 5b. Overlap with Step 3 writers

Only **1 workflow** appears in both Step 3 and Step 3b writer lists:
- **GDA.cron.data-sync** (M0xPvRs31zQOewfx) — writes to `daily_trends` (ADOPT) AND
  `gda_ooda_loops` (one of the 30)

The remaining 39 are new to Step 3b.

### 5c. Pause scope analysis

| Category | Count | Pause? |
|----------|-------|--------|
| Cron/scheduled writers | 11 | **YES** — fire on cadence, will write during window |
| Webhook/API writers | 28 | **YES** — fire on user interaction, low but nonzero risk |
| Form trigger writers | 1 | **YES** — user-facing form submission |
| **Total** | **40** | **All 40 paused** |

> **Disruption note:** Pausing 40 workflows is a larger window than Step 3's 17. The 29
> webhook/form workflows serve API endpoints — pausing them means the GDA frontend features
> they back (chat, discussions, action history, IDIQ tracker, etc.) will return errors during
> the migration window. Expected window: < 5 minutes (Step 3 was ~4m 36s).

### 5d. Canary stance

- **GDA.cron.system-watchdog** (LPUSYd4Vpph1Qg7n) — stays running (does NOT write to any
  of the 30 tables).
- **GDA.cron.change-detector** (Zb2quk78c5mszZ2C) — does NOT write to any of the 30 tables,
  so does NOT need pausing for Step 3b. (In Step 3 it was paused because it writes to
  `gda_opportunity_alerts` and `opportunity_alerts`, which are ADOPT tables.)

---

## 6. Constraint Verification

Post-migration, verify:

### 6a. FK integrity

**Not applicable.** The 30 tables have zero FK relationships (Section 2b). No FK chains
to verify.

### 6b. UNIQUE constraint validation

For each table with UNIQUE constraints (Section 2f), verify no duplicates:
```sql
-- Example for gda_aop_tracker:
SELECT ou, fiscal_year, quarter, COUNT(*)
FROM gda_aop_tracker
GROUP BY ou, fiscal_year, quarter
HAVING COUNT(*) > 1;
-- Must return 0 rows
```

Run for all 8 tables with UNIQUE constraints.

### 6c. CHECK constraint validation

For each table with CHECK constraints (Section 2e), verify all values are within range:
```sql
-- Example for gda_ai_feedback:
SELECT COUNT(*) FROM gda_ai_feedback
WHERE user_action NOT IN ('accept', 'reject', 'modify', 'defer', 'flag');
-- Must return 0
```

Run for both tables (gda_ai_feedback, gda_idiq_tracker with 4 checks).

### 6d. Sequence sync verification

For each of the 28 SERIAL-PK tables:
```sql
SELECT CASE
  WHEN last_value >= COALESCE((SELECT MAX(id) FROM <table>), 0) THEN 'PASS'
  ELSE 'FAIL'
END FROM <table>_id_seq;
```

All 28 must return PASS. `gda_approval_queue` (UUID) and `gda_mega_cache` (manual) are
skipped.

### 6e. pgvector verification

**Not applicable.** None of the 30 tables use pgvector.

---

## 7. Staging Rehearsal Plan

Same 3-pass pattern as Step 3:

### 7a. Pass 1 — Fresh migration

1. Run `/root/refresh-staging.sh` to prime both staging DBs
2. Apply migrations 085-114 to gda_command_staging via psql
3. Run `scripts/f026/step3b-data-migration.sh --target=staging`
4. Expected: 30 copied, 0 skipped, 0 failed
5. Generate parity report: source (n8n staging) vs target (gda_command_staging) row counts

### 7b. Pass 2 — Post-truncate re-run

1. Truncate all 30 tables on gda_command_staging
2. Re-run `scripts/f026/step3b-data-migration.sh --target=staging`
3. Expected: 30 copied, 0 skipped, 0 failed
4. Results MUST match Pass 1 exactly (row counts, sequence values)

### 7c. Pass 3 — Idempotency proof

1. Do NOT truncate — leave Pass 2 data in place
2. Re-run `scripts/f026/step3b-data-migration.sh --target=staging`
3. Expected: 0 copied, 30 skipped, 0 failed (all tables already have matching data)
4. Exit code must be 0

---

## 8. Execution Order (PR 4 — Production)

### Phase A: Pre-flight checks (Sections 1a, 1b′, 1c, 1d)

Verify preconditions using **Section 1b′** (post-PR3 schema state: 118 migrations,
30 tables exist and are empty), plus Sections 1a, 1c, 1d. HALT on any failure.

### Phase B: Backup

```bash
/root/backup-before-migration.sh
```

Capture backup file path, size, and timestamp. This backup is the rollback target —
it contains the 28 ADOPT tables with 4,562 rows. Restoring it rolls back the 30-table
addition without touching the 28 already-migrated tables.

> **Verification:** Confirm the backup includes only gda_command (not n8n DB). A restore
> must leave the 28 ADOPT tables intact and only affect the 30 new tables.

### Phase C: Pause writers

Pause all 40 writer workflows via n8n REST API:
```
PATCH /api/v1/workflows/{id} { "active": false }
```

Capture exact list of 40 IDs with pause timestamps.

### Phase D: Verify pause

```
GET /api/v1/workflows?active=true
```
Expected: active count = original - 40. HALT if diff != 40.

### Phase E: Source snapshot

Capture row counts for all 30 tables on n8n DB. Save to
`docs/audits/f026-step3b-prod-presnapshot-<timestamp>.md`. This is the parity baseline.

### Phase F: Execute migration

```bash
scripts/f026/step3b-data-migration.sh --target=prod
```

Stream to console AND tee to `/var/log/`. Wait for exit.

If exit != 0: **STOP**. Do NOT resume workflows. Do NOT retry. Surface the log.

### Phase G: Post-migration verification

1. Constraint checks (Section 6): UNIQUE, CHECK, sequence sync
2. Target row count snapshot of all 30 tables on gda_command
3. Compare to Phase E source snapshot — must be identical
4. Endpoint health: gda 200, n8n 200, mcp 200

Save comparison to `docs/audits/f026-step3b-prod-postsnapshot-<timestamp>.md`.

### Phase H: Resume writers

Resume all 40 workflows in the same order they were paused:
```
PATCH /api/v1/workflows/{id} { "active": true }
```

Capture resumed timestamps.

### Phase I: Verify resume

Active workflow count must return to original. HALT if not.

### Phase J: Canary verification (15-minute wait)

Verify GDA.cron.system-watchdog has fired at least once (10-min cadence).
Verify GDA.cron.change-detector has fired at least once (5-min cadence).
Both should have run by minute 15 since neither was paused.

---

## 9. Halt Conditions

| # | Condition | Phase | Action |
|---|-----------|-------|--------|
| 1 | Any precondition check fails (Section 1) | Pre-exec | HALT — do not proceed |
| 2 | schema_migrations count != 118 after Step 3b PR 3 apply | Pre-exec | HALT — migrations incomplete |
| 3 | Any of the 30 tables already exist on gda_command before PR 3 | Pre-exec | HALT — unexpected state |
| 4 | Backup script returns non-zero | Phase B | HALT — no rollback target |
| 5 | Active workflow count diff != 40 after pause | Phase D | HALT — pause incomplete |
| 6 | Migration script exit != 0 | Phase F | HALT — do not resume, surface log |
| 7 | Any UNIQUE constraint violation after migration | Phase G | HALT — data integrity issue |
| 8 | Any CHECK constraint violation after migration | Phase G | HALT — data integrity issue |
| 9 | Any sequence value < MAX(id) on SERIAL-PK tables | Phase G | HALT — sequence sync failed |
| 10 | Any row count mismatch (source vs target) | Phase G | HALT — data loss or duplication |
| 11 | Any endpoint returns non-200 | Phase G | HALT — investigate |
| 12 | Active workflow count != original after resume | Phase I | HALT — workflows didn't resume |
| 13 | Canary workflows don't fire within 15 min | Phase J | HALT — scheduling broken |
| 14 | Backend health degraded at any verification point | Any | HALT — investigate |

---

## 10. Rollback

### 10a. Schema rollback (if PR 3 apply fails)

Drop tables in reverse order:
```sql
DROP TABLE IF EXISTS gda_pwin_scores;
DROP TABLE IF EXISTS gda_prompt_architect_memory;
-- ... (reverse of 085-114)
DROP TABLE IF EXISTS gda_action_history;
```

Remove corresponding `schema_migrations` entries:
```sql
DELETE FROM schema_migrations WHERE filename LIKE '085_%' OR filename LIKE '086_%' ... ;
```

### 10b. Data copy failure (mid-flight)

Per-table `TRUNCATE` on the failed table, then re-run that table only. The
`--single-transaction` flag on pg_restore ensures a failure rolls back cleanly
for that table.

### 10c. Full migration rollback

Restore gda_command from the Phase B backup (same `docker exec` pattern as Step 3):
```bash
# Copy backup into the container
docker cp /root/backups/gda_command_<timestamp>.dump gda-postgres:/tmp/restore.dump

# Per-table restore via docker exec
for TABLE in gda_action_history gda_ai_feedback gda_aop_tracker gda_approval_queue \
  gda_capture_lessons gda_chat_history gda_clause_library gda_competitor_crawls \
  gda_compliance_matrices gda_contract_vehicles gda_daily_briefings gda_daily_briefs \
  gda_deep_research gda_dept_market gda_discussions gda_doc_inbox gda_e2e_reports \
  gda_feedback gda_health_scans gda_idiq_tracker gda_incumbent_analysis \
  gda_knowledge_base gda_learning_log gda_meeting_notes gda_mega_cache \
  gda_naics_tracking gda_ndaa_intel gda_ooda_loops gda_prompt_architect_memory \
  gda_pwin_scores; do
  docker exec gda-postgres pg_restore -U gda -d gda_command \
    --table="$TABLE" --single-transaction --clean --if-exists --no-owner \
    /tmp/restore.dump
done
```

> Production `gda-postgres` does not expose port 5432 to the host — must use `docker exec`.
> Each table restored in `--single-transaction` so a failure rolls back only that table.

### 10d. Recovery matrix

| Failure | Recoverable in-place? | Human intervention? |
|---------|----------------------|---------------------|
| Single table copy fails | Yes — truncate + retry that table | No |
| Multiple tables fail | Yes — full restore from backup | Review what caused it |
| Schema apply fails | Yes — DROP tables + remove migrations | No |
| gda_command corrupted | Yes — full restore from backup | Architect should review |
| n8n DB read failure | Retry — source is read-only | No |

---

## 11. Deliberate Non-Goals

1. **Step 3b does NOT touch the 28 already-migrated ADOPT tables.** The migration script
   only writes to the 30 new tables. The 28 ADOPT tables and their 4,562 rows are read-only.

2. **Step 3b does NOT change any credential.** HwronxMmGY5XDGEt and yK1VVsSN3tn0baVm
   remain unchanged. Credential repointing is Step 4.

3. **Step 3b does NOT drop tables from n8n DB.** That's Step 5.

4. **Step 3b does NOT restart gda-backend.** Backend restart is bundled with Step 4.

5. **Step 3b does NOT modify any workflow JSON.** Only pause/resume via the REST API.

---

## 12. Open Questions

### 12a. gda_mega_cache PK assignment

`gda_mega_cache` has `id INTEGER NOT NULL` as PK but no DEFAULT sequence. The single
existing row has `id=1` (presumably manually assigned by the workflow's INSERT). The
migration will copy this row as-is. If the workflow continues to `INSERT INTO gda_mega_cache`
with an explicit `id` value after cutover, this works. If any workflow uses
`DEFAULT` or omits `id`, the INSERT will fail.

**Risk:** Low — the workflow code shows `id: 1` hardcoded in the INSERT. But should we add
a sequence to be safe?

### 12b. Active workflow count at pause time

Step 3 expected 157 active workflows and paused 17 (leaving 140). Step 3b pauses 40, but
some of those 40 may overlap with the Step 3 writer set that was previously paused and
resumed. The expected active count before pausing needs to be captured live (not assumed).

GDA.cron.data-sync (M0xPvRs31zQOewfx) is the only overlap between Step 3 and Step 3b
writer lists. The rest of the 40 are independent.

### 12c. Row count growth since PR #298

The PR #298 Section 0a matrix estimated ~81 total rows. Current live count is ~1,024 rows
(workflows continued writing). Notable growth:
- gda_e2e_reports: 27 → 268
- gda_learning_log: 0 → 331
- gda_action_history: 6 → 54
- gda_chat_history: 6 → 52
- gda_daily_briefings: 55 → 60
- gda_meeting_notes: 0 → 43

This is expected behavior (live system). The pre-migration snapshot (Phase E) captures the
authoritative count at execution time. No action needed — just surface for awareness.
