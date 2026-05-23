# F-026 Step 4b — Staging Rehearsal Proof

**Date:** 2026-05-23  
**Environment:** gda-postgres-staging (same container, n8n_staging → gda_command_staging)  
**Script:** `scripts/f026/step4b/migrate-orphans.sh --target=staging`  
**Rehearsal operator:** Devin

---

## 3-Pass Rehearsal Summary

| Pass | Action | Result | Pause Start (EST) | Unpause (EST) | Window |
|------|--------|--------|-------------------|---------------|--------|
| 1 | Fresh migrate | 6/6 COPIED | 1:49:51 PM | 1:50:21 PM | 30s |
| 2 | Truncate + re-migrate | 6/6 COPIED | 1:50:43 PM | 1:51:08 PM | 25s |
| 3 | Idempotency re-run | 6/6 SKIPPED | 1:51:21 PM | 1:51:37 PM | 16s |

All 3 passes: **EXIT: Success**

---

## Pass 1 — Fresh Migrate

### Pre-flight
- 6/6 source tables present on n8n_staging
- 6/6 target tables present on gda_command_staging (empty, from migrations 115-120)
- FK prerequisite: gda_opportunity_tracker present on target
- FK orphan check: **0 orphaned opportunity_id values**

### Per-table results

| Table | Source | Target Pre | Target Post | Sequence | Status |
|-------|--------|-----------|-------------|----------|--------|
| gda_pattern_library | 219 | 0 | 219 | 219 | PASS |
| gda_stage_audit | 12 | 0 | 12 | 12 | PASS |
| gda_content_store | 13 | 0 | 13 | 20 | PASS |
| gda_data_lake | 54 | 0 | 54 | 54 | PASS |
| gda_interaction_log | 30 | 0 | 30 | 30 | PASS |
| gda_decision_memory | 2 | 0 | 2 | 2 | PASS |
| **Total** | **330** | **0** | **330** | — | **6/6 PASS** |

### Post-migration validation
- FK validation (gda_decision_memory.opportunity_id): **PASS — 0 orphaned FK values**
- UNIQUE gda_content_store(content_hash): **PASS — 0 duplicates**
- UNIQUE gda_data_lake(source, source_id, record_type): **PASS — 0 duplicates**
- Sequence sync: **6/6 PASS**

### Notes
- `gda_content_store` sequence set to 20 (= MAX(id)), not 30 (source sequence last_value). This is correct: `COALESCE(MAX(id), 1)` uses actual data max, not the stale source sequence.

---

## Pass 2 — Truncate + Re-migrate

Target tables truncated and sequences reset to 1 before re-run.

### Per-table results

| Table | Source | Target Pre | Target Post | Sequence | Status |
|-------|--------|-----------|-------------|----------|--------|
| gda_pattern_library | 219 | 0 | 219 | 219 | PASS |
| gda_stage_audit | 12 | 0 | 12 | 12 | PASS |
| gda_content_store | 13 | 0 | 13 | 20 | PASS |
| gda_data_lake | 54 | 0 | 54 | 54 | PASS |
| gda_interaction_log | 30 | 0 | 30 | 30 | PASS |
| gda_decision_memory | 2 | 0 | 2 | 2 | PASS |
| **Total** | **330** | **0** | **330** | — | **6/6 PASS** |

### Post-migration validation
- FK validation: **PASS — 0 orphaned FK values**
- UNIQUE checks: **2/2 PASS**
- Sequence sync: **6/6 PASS**

---

## Pass 3 — Idempotency Re-run

Re-ran without truncating. All tables already contain data from Pass 2.

### Per-table results

| Table | Source | Target | Decision | Status |
|-------|--------|--------|----------|--------|
| gda_pattern_library | 219 | 219 | SKIP | PASS |
| gda_stage_audit | 12 | 12 | SKIP | PASS |
| gda_content_store | 13 | 13 | SKIP | PASS |
| gda_data_lake | 54 | 54 | SKIP | PASS |
| gda_interaction_log | 30 | 30 | SKIP | PASS |
| gda_decision_memory | 2 | 2 | SKIP | PASS |
| **Total** | **330** | **330** | **6 SKIP** | **6/6 PASS** |

### Post-migration validation
- FK validation: **PASS — 0 orphaned FK values**
- UNIQUE checks: **2/2 PASS**
- Sequence sync: **6/6 PASS**
- Copied: 0, Skipped: 6, Failed: 0

---

## Q1 — FK Orphan Check (gda_decision_memory.opportunity_id)

Checked both pre-flight and post-migration across all 3 passes.

```
Pre-flight (source n8n_staging):
  SELECT COUNT(*) FROM gda_decision_memory dm
  WHERE dm.opportunity_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM gda_opportunity_tracker ot WHERE ot.id = dm.opportunity_id);
  → 0

Post-migration (target gda_command_staging):
  Same query → 0
```

Both source rows have `opportunity_id=1150`, which exists in `gda_opportunity_tracker` on the target. FK constraint is satisfied.

---

## Q3 — Backend Proxy DB Target Verification

### Backend environment variable

```
DATABASE_URL=postgresql://gda:<REDACTED>@postgres:5432/gda_command
```

Backend is configured to connect to `postgres:5432/gda_command` (Docker DNS resolves `postgres` to the `gda-postgres` container).

### pg_stat_activity verification

```sql
SELECT datname, usename, client_addr, state, count(*)
FROM pg_stat_activity
WHERE datname='gda_command'
GROUP BY datname, usename, client_addr, state;

 datname     | usename | client_addr | state  | count
-------------+---------+-------------+--------+------
 gda_command | gda     | 172.22.0.3  | idle   |     1
 gda_command | gda     |             | active |     1
```

### IP confirmation

```
docker inspect gda-backend --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
→ 172.22.0.3
```

**Result:** Backend container (gda-backend, IP 172.22.0.3) has an active connection pool to `gda_command` on `gda-postgres`. Any SQL routed through the backend proxy (via webhook-auth credential F4J3vYsPrJrYiO49) will execute against `gda_command`.

**Note:** GDA.auto.learning-capture (Rvs15RThVvlj3nVz) could not be triggered end-to-end in staging because there is no staging n8n instance. However, the backend proxy DB target is confirmed via environment variable inspection and live pg_stat_activity connection tracking. In production, this workflow will be verified post-migration in PR 4.

---

## Sequence Values Post-Import

| Table | Sequence Name | last_value | MAX(id) | Status |
|-------|--------------|-----------|---------|--------|
| gda_pattern_library | gda_pattern_library_id_seq | 219 | 219 | OK |
| gda_stage_audit | gda_stage_audit_id_seq | 12 | 12 | OK |
| gda_content_store | gda_content_store_id_seq | 20 | 20 | OK (source seq was 30, MAX(id) used) |
| gda_data_lake | gda_data_lake_id_seq | 54 | 54 | OK |
| gda_interaction_log | gda_interaction_log_id_seq | 30 | 30 | OK |
| gda_decision_memory | gda_decision_memory_id_seq | 2 | 2 | OK |

---

## Migration Index Collision Note

During migration 116 (gda_stage_audit), the index `idx_audit_created` already existed on staging from a previous migration. `CREATE INDEX IF NOT EXISTS` handled it gracefully:

```
psql:/tmp/migration.sql:31: NOTICE: relation "idx_audit_created" already exists, skipping
```

This is a staging-only artifact. The production gda_command database does not have this index pre-existing.

---

## Summary

| Check | Result |
|-------|--------|
| Pass 1 (fresh migrate) | 6/6 PASS, 330 rows |
| Pass 2 (truncate + re-migrate) | 6/6 PASS, 330 rows |
| Pass 3 (idempotency) | 6/6 SKIP, 0 failures |
| Q1: FK orphan check | 0 orphans (all passes) |
| Q3: Backend proxy DB target | gda_command confirmed (env + pg_stat_activity) |
| UNIQUE constraints | 2/2 PASS (all passes) |
| Sequence sync | 6/6 PASS (all passes) |
| Script exit code | 0 (all passes) |

**Staging rehearsal: PASS.** Ready for PR 3 (schema apply to prod) and PR 4 (prod data migration).
