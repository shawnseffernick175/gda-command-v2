# F-026 Step 4b Plan — Orphan Table Migration (6 tables, ~330 rows)

**Status:** PLAN ONLY — no execution until architect approval  
**Prerequisite:** Step 4 CLOSED (PR #304, commit d1c56f9, 2026-05-23 12:24 PM EST)  
**Motivation:** Phase 5a prerequisite per PR #305 (Step 5 master plan)  
**Plan author:** Devin  
**Date:** 2026-05-19  

---

## 1. Executive Summary

### Why Step 4b exists

Step 5 (PR #305) identified 6 GDA tables on n8n-envision-postgres-1/n8n that do NOT exist on gda-postgres/gda_command. Two of these tables (`gda_pattern_library`, `gda_stage_audit`) are actively referenced by workflows using credential `HwronxMmGY5XDGEt`, which was pivoted to gda-postgres/gda_command in Step 4. These workflows will ERROR on next execution because the target tables don't exist. The remaining 4 tables are referenced by webhook-auth workflows that build SQL via Code nodes.

Step 4b migrates all 6 tables to gda_command, closing the gap before Phase 5a rename.

### 4-PR sub-sequence

| PR | Scope | Pattern |
|----|-------|---------|
| PR 1 (this) | Plan document | Architect-read artifact |
| PR 2 | Migration script + staging rehearsal | 3-pass rehearsal proof (copy, truncate+recopy, idempotency) |
| PR 3 | Schema apply to prod gda_command | 6 CREATE TABLE migrations applied via psql |
| PR 4 | Production data migration | pg_dump export → psql import, parity verification |

### Pause window estimate

~330 rows across 6 tables. Step 3b migrated 1,024 rows in ~3 minutes. Expected Step 4b pause window: **< 2 minutes** (writers paused, canary NOT paused).

---

## 2. Workflow Reference Audit (2-Pass)

### Pass 1 — Table reference search

All 158 active+inactive workflows scanned for references to the 6 orphan table names in Postgres node parameters, Code node SQL, and HTTP Request node configurations.

| Workflow ID | Workflow Name | Table Referenced | Reference Type | Node(s) |
|-------------|--------------|-----------------|----------------|---------|
| Rvs15RThVvlj3nVz | GDA.auto.learning-capture | `gda_pattern_library` | httpRequest node (backend proxy) | Get Memory Stats |
| Rvs15RThVvlj3nVz | GDA.auto.learning-capture | `gda_content_store` | Code node (SQL builder) + httpRequest | Build Queries; Get Memory Stats |
| Rvs15RThVvlj3nVz | GDA.auto.learning-capture | `gda_decision_memory` | Code node (SQL builder) + httpRequest | Build Queries; Get Memory Stats |
| Rvs15RThVvlj3nVz | GDA.auto.learning-capture | `gda_interaction_log` | Code node (SQL builder) + httpRequest | Build Queries; Get Memory Stats |
| njIW6V5tCFJIIjfk | GDA.auto.pattern-extractor | `gda_pattern_library` | Code node (SQL builder) | Parse & Store Patterns |
| 51SkEH6ulJrmHdgS | GDA.cron.competitor-auto-enrichment | `gda_data_lake` | Code node (SQL builder) | Build Enrichment Queries |
| 3sFvFJwP0xlihoLj | GDA.event.bidirectional-sync | `gda_stage_audit` | Postgres node (direct DB) | Audit Log |
| 1o8h7yGhLKLoNP0S | GDA.cron.amendment-monitor | `gda_stage_audit` | Postgres node (direct DB) | Log Amendment |

### Pass 2 — Classification

| Workflow ID | Workflow Name | Table | Credential Path | Active | Last Execution | Breaks on Phase 5a rename? |
|-------------|--------------|-------|----------------|--------|----------------|---------------------------|
| Rvs15RThVvlj3nVz | GDA.auto.learning-capture | `gda_content_store` | F4J3vYsPrJrYiO49 (webhook auth → backend proxy) | YES | No executions | MAYBE — depends on backend proxy DB target |
| Rvs15RThVvlj3nVz | GDA.auto.learning-capture | `gda_decision_memory` | F4J3vYsPrJrYiO49 (webhook auth → backend proxy) | YES | No executions | MAYBE — depends on backend proxy DB target |
| Rvs15RThVvlj3nVz | GDA.auto.learning-capture | `gda_interaction_log` | F4J3vYsPrJrYiO49 (webhook auth → backend proxy) | YES | No executions | MAYBE — depends on backend proxy DB target |
| Rvs15RThVvlj3nVz | GDA.auto.learning-capture | `gda_pattern_library` | F4J3vYsPrJrYiO49 (webhook auth → backend proxy) | YES | No executions | MAYBE — depends on backend proxy DB target |
| njIW6V5tCFJIIjfk | GDA.auto.pattern-extractor | `gda_pattern_library` | F4J3vYsPrJrYiO49 (webhook auth → backend proxy) | YES | No executions | MAYBE — depends on backend proxy DB target |
| 51SkEH6ulJrmHdgS | GDA.cron.competitor-auto-enrichment | `gda_data_lake` | F4J3vYsPrJrYiO49 (webhook auth → backend proxy) | YES | No executions | MAYBE — depends on backend proxy DB target |
| 3sFvFJwP0xlihoLj | GDA.event.bidirectional-sync | `gda_stage_audit` | **HwronxMmGY5XDGEt** (direct Postgres) | YES | No executions | **YES** — Postgres node queries gda_command where table doesn't exist |
| 1o8h7yGhLKLoNP0S | GDA.cron.amendment-monitor | `gda_stage_audit` | **HwronxMmGY5XDGEt** (direct Postgres) | YES | Last success 2026-05-23T12:00:00Z | **YES** — Postgres node queries gda_command where table doesn't exist |

**Summary:**
- **2 workflows WILL break** without Step 4b: `GDA.event.bidirectional-sync` and `GDA.cron.amendment-monitor` use `HwronxMmGY5XDGEt` (now pointing at gda_command) to directly query `gda_stage_audit`.
- **4 workflows MAY break**: Use webhook auth (F4J3vYsPrJrYiO49) to call backend proxy, which executes SQL against its configured DB. If the backend proxy targets gda_command (post-Step 4 rebuild), these will also fail on missing tables.
- **4 of 5 unique workflows have zero execution history** — either never fired or data pruned. Only `GDA.cron.amendment-monitor` has recent execution.

---

## 3. F4J3vYsPrJrYiO49 Behavior Classification

### Credential export (decrypted)

```json
{
  "id": "F4J3vYsPrJrYiO49",
  "name": "GDA Webhook Auth v2",
  "type": "httpHeaderAuth",
  "data": {
    "name": "x-gda-key",
    "value": "gda-webhook-secret-2026"
  },
  "createdAt": "2026-05-13T15:40:40.491Z",
  "updatedAt": "2026-05-17T23:28:06.912Z"
}
```

### Classification

`F4J3vYsPrJrYiO49` is an **HTTP header authentication credential** (type: `httpHeaderAuth`). It adds header `x-gda-key: gda-webhook-secret-2026` to outgoing HTTP requests. It is **NOT a Postgres credential** and never directly connects to any database.

### How the 4 webhook-auth workflows access the 6 tables

These workflows use Code nodes to **build SQL strings** (INSERT/SELECT statements referencing the table names), then pass those SQL strings via HTTP Request nodes to a **backend proxy endpoint** (gda-backend API) which executes the SQL. The backend proxy uses its own database connection configuration (post-PR#288, this is gda-postgres/gda_command).

**Implication:** Since gda-backend was rebuilt on post-PR#288 code and connects to gda_command, any SQL referencing the 6 orphan tables will fail with `relation "X" does not exist` — the same failure mode as the direct Postgres workflows, just routed through the backend proxy instead of n8n's Postgres node.

**Verdict:** All 6 orphan tables need to exist on gda_command before any of the 8 workflow-table references can succeed.

---

## 4. Schema Diff for the 6 Tables

### Confirmation: tables do NOT exist on gda_command

```
gda_pattern_library  → NULL (does not exist)
gda_stage_audit      → NULL (does not exist)
gda_content_store    → NULL (does not exist)
gda_data_lake        → NULL (does not exist)
gda_decision_memory  → NULL (does not exist)
gda_interaction_log  → NULL (does not exist)
```

### Table schemas (from n8n-envision-postgres-1/n8n)

#### gda_pattern_library (219 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NOT NULL | nextval('gda_pattern_library_id_seq') |
| pattern_type | text | NOT NULL | |
| pattern_name | text | NOT NULL | |
| description | text | | |
| conditions | jsonb | NOT NULL | |
| historical_outcome | jsonb | NOT NULL | |
| sample_size | integer | | 0 |
| confidence | numeric | | 0 |
| last_validated | timestamptz | | |
| active | boolean | | true |
| created_at | timestamptz | | now() |
| updated_at | timestamptz | | now() |

**Indexes:** PK(id), idx_pattern_active(active), idx_pattern_type(pattern_type)  
**Sequence:** gda_pattern_library_id_seq (last_value=219, max_id=219)  
**FK:** None  
**UNIQUE:** None  

#### gda_stage_audit (12 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NOT NULL | nextval('gda_stage_audit_id_seq') |
| plan_id | integer | | |
| opportunity | text | | |
| from_stage | text | | |
| to_stage | text | | |
| changed_by | text | | 'user' |
| change_reason | text | | |
| created_at | timestamptz | | now() |

**Indexes:** PK(id), idx_audit_created(created_at DESC), idx_audit_plan(plan_id)  
**Sequence:** gda_stage_audit_id_seq (last_value=12, max_id=12)  
**FK:** None  
**UNIQUE:** None  

#### gda_content_store (13 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NOT NULL | nextval('gda_content_store_id_seq') |
| content_type | text | NOT NULL | |
| source_table | text | | |
| source_id | integer | | |
| title | text | | |
| content | text | NOT NULL | |
| content_hash | text | | |
| metadata | jsonb | | '{}' |
| embedding_status | text | | 'pending' |
| chunk_index | integer | | 0 |
| token_count | integer | | 0 |
| created_at | timestamptz | | now() |
| embedded_at | timestamptz | | |

**Indexes:** PK(id), UNIQUE(content_hash), idx_content_source(source_table, source_id), idx_content_status(embedding_status), idx_content_type(content_type)  
**Sequence:** gda_content_store_id_seq (last_value=30, max_id=20)  
**FK:** None  
**UNIQUE:** content_hash  

#### gda_data_lake (54 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NOT NULL | nextval('gda_data_lake_id_seq') |
| source | text | NOT NULL | |
| source_id | text | | |
| record_type | text | NOT NULL | |
| raw_data | jsonb | NOT NULL | |
| normalized_data | jsonb | | |
| processing_status | text | | 'pending' |
| error_message | text | | |
| ingested_at | timestamptz | | now() |
| processed_at | timestamptz | | |
| batch_id | text | | |
| dedup_key | text | | |

**Indexes:** PK(id), UNIQUE(source, source_id, record_type), idx_datalake_batch(batch_id), idx_datalake_dedup(dedup_key), idx_datalake_ingested(ingested_at DESC), idx_datalake_source(source), idx_datalake_status(processing_status), idx_datalake_type(record_type)  
**Sequence:** gda_data_lake_id_seq (last_value=54, max_id=54)  
**FK:** None  
**UNIQUE:** (source, source_id, record_type)  

#### gda_decision_memory (2 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NOT NULL | nextval('gda_decision_memory_id_seq') |
| opportunity_id | integer | | |
| decision_type | text | NOT NULL | |
| decision | text | NOT NULL | |
| confidence | numeric | | |
| reasoning | text | | |
| factors | jsonb | | '{}' |
| context_snapshot | jsonb | | '{}' |
| outcome | text | | |
| outcome_date | timestamptz | | |
| outcome_details | jsonb | | |
| accuracy_score | numeric | | |
| decision_by | text | | 'system' |
| reviewed_by | text | | |
| created_at | timestamptz | | now() |
| updated_at | timestamptz | | now() |

**Indexes:** PK(id), idx_decision_created(created_at DESC), idx_decision_opp(opportunity_id), idx_decision_outcome(outcome), idx_decision_type(decision_type)  
**Sequence:** gda_decision_memory_id_seq (last_value=2, max_id=2)  
**FK:** opportunity_id → gda_opportunity_tracker(id)  
**UNIQUE:** None  

#### gda_interaction_log (30 rows)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | integer | NOT NULL | nextval('gda_interaction_log_id_seq') |
| user_id | text | | 'shawn' |
| interaction_type | text | NOT NULL | |
| entity_type | text | | |
| entity_id | integer | | |
| action | text | NOT NULL | |
| context | jsonb | | '{}' |
| result | jsonb | | '{}' |
| session_id | text | | |
| created_at | timestamptz | | now() |

**Indexes:** PK(id), idx_interact_created(created_at DESC), idx_interact_entity(entity_type, entity_id), idx_interact_type(interaction_type)  
**Sequence:** gda_interaction_log_id_seq (last_value=30, max_id=30)  
**FK:** None  
**UNIQUE:** None  

---

## 5. FK / Constraint Audit

### Foreign keys FROM the 6 tables

| Table | Column | References | Target exists on gda_command? |
|-------|--------|-----------|------------------------------|
| `gda_decision_memory` | `opportunity_id` | `gda_opportunity_tracker(id)` | **YES** — migrated in Step 3 (1,780 rows) |

### Foreign keys TO the 6 tables

None. No other table on n8n-envision-postgres-1/n8n references any of the 6 orphan tables.

### Migration order implications

`gda_decision_memory` has a FK to `gda_opportunity_tracker`, which already exists on gda_command. No special ordering required — any of the 6 tables can be created in any order. The FK constraint can be created alongside the table since its target already exists.

### UNIQUE constraints

| Table | Constraint |
|-------|-----------|
| `gda_content_store` | UNIQUE(content_hash) |
| `gda_data_lake` | UNIQUE(source, source_id, record_type) |

### CHECK constraints

None on any of the 6 tables.

---

## 6. Data Export/Import Strategy

Mirror Step 3b pattern exactly.

### Export (from n8n-envision-postgres-1)

```bash
for TABLE in gda_pattern_library gda_stage_audit gda_content_store gda_data_lake gda_decision_memory gda_interaction_log; do
  docker exec n8n-envision-postgres-1 pg_dump -U n8n -d n8n \
    --data-only --table=public.$TABLE \
    --no-owner --no-acl \
    > /tmp/step4b-export-$TABLE.sql
done
```

### Import (to gda-postgres/gda_command)

```bash
for TABLE in gda_pattern_library gda_stage_audit gda_content_store gda_data_lake gda_decision_memory gda_interaction_log; do
  docker exec -i gda-postgres psql -U gda -d gda_command -1 \
    < /tmp/step4b-export-$TABLE.sql
done
```

### Sequence reset

```sql
SELECT setval('gda_pattern_library_id_seq', (SELECT COALESCE(MAX(id), 1) FROM gda_pattern_library));
SELECT setval('gda_stage_audit_id_seq', (SELECT COALESCE(MAX(id), 1) FROM gda_stage_audit));
SELECT setval('gda_content_store_id_seq', (SELECT COALESCE(MAX(id), 1) FROM gda_content_store));
SELECT setval('gda_data_lake_id_seq', (SELECT COALESCE(MAX(id), 1) FROM gda_data_lake));
SELECT setval('gda_decision_memory_id_seq', (SELECT COALESCE(MAX(id), 1) FROM gda_decision_memory));
SELECT setval('gda_interaction_log_id_seq', (SELECT COALESCE(MAX(id), 1) FROM gda_interaction_log));
```

### Row count parity check

```sql
-- Per table: source count (n8n) must equal dest count (gda_command)
SELECT '<table_name>' AS tbl,
  (SELECT COUNT(*) FROM <table_name>) AS dest_count;
-- Compare against source count captured during export
```

Expected totals:

| Table | Expected Rows |
|-------|--------------|
| gda_pattern_library | 219 |
| gda_stage_audit | 12 |
| gda_content_store | 13 |
| gda_data_lake | 54 |
| gda_decision_memory | 2 |
| gda_interaction_log | 30 |
| **Total** | **330** |

---

## 7. Pause Window Plan

### Workflows to pause

Same 40 writer workflows + change-detector as Step 3b and Step 4 (IDs documented in PR #299 plan and PR #302 audit).

- **40 writer workflows** — paused before data import
- **Change-detector** (Zb2quk78c5mszZ2C) — pauses with writers
- **Canary** (LPUSYd4Vpph1Qg7n GDA.cron.system-watchdog) — **NOT paused**, stays running

### Estimated duration

- Step 3b migrated 1,024 rows across 23 non-empty tables in ~3 minutes
- Step 4b has 330 rows across 6 tables (all non-empty)
- **Expected pause window: < 2 minutes**

### Sequence

1. Record pause-start timestamp (EST)
2. Pause 40 writers + change-detector via n8n API
3. Verify all paused
4. Export + import + sequence reset + parity check
5. Unpause all
6. Record unpause timestamp (EST)
7. Compute total pause window

---

## 8. Rollback Plan

### PR 3 rollback (schema apply)

```sql
DROP TABLE IF EXISTS gda_pattern_library CASCADE;
DROP TABLE IF EXISTS gda_stage_audit CASCADE;
DROP TABLE IF EXISTS gda_content_store CASCADE;
DROP TABLE IF EXISTS gda_data_lake CASCADE;
DROP TABLE IF EXISTS gda_decision_memory CASCADE;
DROP TABLE IF EXISTS gda_interaction_log CASCADE;
```

Safe because no other tables reference these 6, and no data has been imported yet.

### PR 4 rollback (data import)

```sql
TRUNCATE gda_pattern_library, gda_stage_audit, gda_content_store, gda_data_lake, gda_decision_memory, gda_interaction_log;
-- Reset sequences to 1
SELECT setval('gda_pattern_library_id_seq', 1, false);
SELECT setval('gda_stage_audit_id_seq', 1, false);
SELECT setval('gda_content_store_id_seq', 1, false);
SELECT setval('gda_data_lake_id_seq', 1, false);
SELECT setval('gda_decision_memory_id_seq', 1, false);
SELECT setval('gda_interaction_log_id_seq', 1, false);
```

Then unpause writers.

### Source data safety

n8n-envision-postgres-1 is **NEVER modified** during Step 4b. All operations are read-only exports. Source data remains intact as forensic record for Phase 5a backup.

---

## 9. Gates

| Gate | Requirement |
|------|------------|
| PR 2 → PR 3 | Staging rehearsal passes: full export+import dry run, row count parity on all 6 tables, sequence sync verified |
| PR 3 → PR 4 | CI Migration Smoke Test green, 6 empty tables confirmed on prod gda_command |
| PR 4 execution | PR 3 schema live on prod AND writers paused AND pre-import row count snapshot captured |
| PR 4 → complete | All 6 tables: source/dest row count parity, sequences synced, FK constraint on gda_decision_memory valid, canary still green, backend still 200 |

---

## 10. Open Questions for Architect

### Q1: gda_decision_memory FK enforcement

`gda_decision_memory.opportunity_id` has a FK to `gda_opportunity_tracker(id)` on the n8n source. Should the migration CREATE TABLE include this FK on gda_command?

**Arguments for:** Data integrity, matches source schema exactly.  
**Arguments against:** If opportunity_tracker rows were pruned by retention cron (Step 3 showed −110 delta), orphaned FK values could block import.

**Recommendation:** Include the FK in the CREATE TABLE, but verify during staging rehearsal that all `opportunity_id` values in the 2 rows exist in `gda_opportunity_tracker` on gda_command. If any are orphaned, surface before PR 4.

### Q2: Migration numbering

Step 3b used migrations 085-114. What range should Step 4b use? Recommend 115-120 (6 migrations, one per table) to continue the sequence. Confirm with architect.

### Q3: Backend proxy SQL execution path

The 4 webhook-auth workflows (learning-capture, pattern-extractor, competitor-auto-enrichment) build SQL via Code nodes and send it through the backend proxy. Is the backend proxy's DB connection definitely gda-postgres/gda_command post-rebuild? If it still routes some queries to n8n DB, the migration may not fully resolve these workflows.

**Recommendation:** Verify during PR 2 staging rehearsal by triggering one of these workflows and confirming the SQL executes against gda_command.

---

## Appendix: Constraint & Index Summary

| Table | PK | Sequences | Indexes | UNIQUE | FK | CHECK |
|-------|-----|-----------|---------|--------|-----|-------|
| gda_pattern_library | id (serial) | gda_pattern_library_id_seq | 3 | 0 | 0 | 0 |
| gda_stage_audit | id (serial) | gda_stage_audit_id_seq | 3 | 0 | 0 | 0 |
| gda_content_store | id (serial) | gda_content_store_id_seq | 5 | 1 (content_hash) | 0 | 0 |
| gda_data_lake | id (serial) | gda_data_lake_id_seq | 8 | 1 (source, source_id, record_type) | 0 | 0 |
| gda_decision_memory | id (serial) | gda_decision_memory_id_seq | 5 | 0 | 1 (opportunity_id → gda_opportunity_tracker) | 0 |
| gda_interaction_log | id (serial) | gda_interaction_log_id_seq | 4 | 0 | 0 | 0 |
| **Totals** | 6 | 6 | 28 | 2 | 1 | 0 |
