# F-026 Step 3 — Data Migration: n8n DB → gda_command

**Author:** Devin  
**Date:** 2026-05-22  
**Status:** DRAFT — awaiting architect review  
**Parent issue:** F-026 (DB consolidation)  
**Prerequisite PRs:** #283 (F-023 inventory), #286 (F-023a), #287 (F-023b), #288 (F-023c migrations 057–084), #290 (F-036 staging)

---

## 1. Objective

Copy all data from 28 ADOPT shadow tables in `n8n-envision-postgres-1` (the n8n database)
into matching tables in `gda_command` (on `gda-postgres`). The schema for all 28 tables
already exists in gda_command via migrations 057–084 (F-023a/b/c). This step copies **data
only**.

After this step:
- `gda_command` holds the authoritative copy of all 28 ADOPT tables.
- The original shadow tables in the n8n DB remain intact as a fallback until Step 5 drops them.
- No workflows have been repointed yet (that's Step 4).

---

## 2. Invariants (Written Rules)

1. **n8n's own database is NEVER touched.** The `n8n` DB on `n8n-envision-postgres-1` contains
   92 n8n-internal tables managed by n8n's migration system. This step only READS from the n8n
   DB. No INSERT, UPDATE, DELETE, DROP, ALTER, or TRUNCATE against n8n-internal tables.

2. **No workflow credentials are modified in Step 3.** The "GDA Postgres" credential
   (`HwronxMmGY5XDGEt`) and the "Postgres account" credential (`yK1VVsSN3tn0baVm`) remain
   unchanged. Credential repointing is Step 4.

3. **No shadow tables are dropped in Step 3.** The 28 ADOPT tables in the n8n DB remain intact
   after this step. Dropping is Step 5.

4. **gda_command application tables (the 89 already in the DB) are NEVER modified.** The
   migration script only INSERTs into the 28 newly-created (empty) ADOPT tables. The existing
   89 tables (`sam_opportunities`, `opportunities`, `schema_migrations`, etc.) are read-only
   during this operation.

5. **Production migrations are NEVER run without a successful staging rehearsal first.** The
   migration script must pass against staging twice (proving idempotency) before production
   execution is authorized.

---

## 3. Pre-Flight State Capture

Run these commands on the VPS **before** any migration execution. Save all output to
`/root/f026-step3-pre-state-$(date -u +%Y%m%dT%H%M%SZ).txt`.

### 3a. Row counts of all 28 ADOPT tables on n8n DB (source)

```bash
TABLES="gda_relationships gda_touchpoints gda_risk_register gda_opportunity_tracker gda_capture_plans gda_intelligence_log gda_competitor_watchlist opportunity_alerts gda_competitor_cache gda_action_items gda_active_contracts gda_dashboard_intel_cache daily_trends gda_opportunity_alerts gda_morning_briefings gda_learned_weights gda_win_loss gda_error_log gda_saved_opportunities gda_teaming_partners ft_signal_source ft_opportunity_signal gda_embeddings govtribe_cache gda_wargames gda_win_loss_db gda_trend_arrays gda_contacts"

echo "=== SOURCE ROW COUNTS (n8n DB on n8n-envision-postgres-1) ==="
for t in $TABLES; do
  COUNT=$(docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -t -c "SELECT count(*) FROM $t;" | tr -d ' ')
  echo "$t: $COUNT"
done
```

> **Reference data only.** The table below was captured 2026-05-22 18:30 UTC. Execution uses
> fresh live counts from the pre-flight script above. Drift between this table and live counts
> is expected (workflows are actively writing to these tables) and is **not** a halt condition.

**Baseline counts (captured 2026-05-22 18:30 UTC):**

| # | Table | Rows | Migration | Notes |
|---|-------|------|-----------|-------|
| 1 | gda_relationships | 0 | 057 | FK parent of gda_touchpoints |
| 2 | gda_touchpoints | 0 | 058 | FK child → gda_relationships.id |
| 3 | gda_risk_register | 464 | 059 | Renamed in F-023b |
| 4 | gda_opportunity_tracker | 1,780 | 060 | Core pipeline, 54 consumers |
| 5 | gda_capture_plans | 110 | 061 | |
| 6 | gda_intelligence_log | 54 | 062 | |
| 7 | gda_competitor_watchlist | 46 | 063 | |
| 8 | opportunity_alerts | 2 | 064 | |
| 9 | gda_competitor_cache | 1 | 065 | |
| 10 | gda_action_items | 47 | 066 | |
| 11 | gda_active_contracts | 5 | 067 | |
| 12 | gda_dashboard_intel_cache | 6 | 068 | |
| 13 | daily_trends | 537 | 069 | |
| 14 | gda_opportunity_alerts | 7 | 070 | |
| 15 | gda_morning_briefings | 40 | 071 | |
| 16 | gda_learned_weights | 18 | 072 | |
| 17 | gda_win_loss | 6 | 073 | |
| 18 | gda_error_log | 334 | 074 | |
| 19 | gda_saved_opportunities | 0 | 075 | |
| 20 | gda_teaming_partners | 12 | 076 | |
| 21 | ft_signal_source | 10 | 077 | FK parent of ft_opportunity_signal |
| 22 | ft_opportunity_signal | 234 | 078 | FK child → ft_signal_source.source_id |
| 23 | gda_embeddings | 821 | 079 | pgvector, vector(1536), 14 MB |
| 24 | govtribe_cache | 0 | 080 | |
| 25 | gda_wargames | 1 | 081 | |
| 26 | gda_win_loss_db | 10 | 082 | |
| 27 | gda_trend_arrays | 15 | 083 | |
| 28 | gda_contacts | 2 | 084 | PII (email, phone) |

**Total: 4,562 rows across 28 tables (~20 MB including indexes)**

### 3b. Row counts of all existing tables on gda_command (target — must be unchanged after migration)

```bash
echo "=== TARGET PRE-STATE (gda_command on gda-postgres) ==="
docker exec gda-postgres psql -U gda -d gda_command -t -c "
SELECT tablename, n_live_tup 
FROM pg_stat_user_tables 
WHERE schemaname='public' 
ORDER BY tablename;" > /root/f026-step3-gda-command-prestate.txt
cat /root/f026-step3-gda-command-prestate.txt
```

### 3c. Existence check — ADOPT tables must NOT already have data in gda_command

```bash
echo "=== ADOPT TABLE DATA CHECK (must all be 0) ==="
ADOPT_TABLES="gda_relationships gda_touchpoints gda_risk_register gda_opportunity_tracker gda_capture_plans gda_intelligence_log gda_competitor_watchlist opportunity_alerts gda_competitor_cache gda_action_items gda_active_contracts gda_dashboard_intel_cache daily_trends gda_opportunity_alerts gda_morning_briefings gda_learned_weights gda_win_loss gda_error_log gda_saved_opportunities gda_teaming_partners ft_signal_source ft_opportunity_signal gda_embeddings govtribe_cache gda_wargames gda_win_loss_db gda_trend_arrays gda_contacts"

for t in $ADOPT_TABLES; do
  COUNT=$(docker exec gda-postgres psql -U gda -d gda_command -t -c "SELECT count(*) FROM $t;" 2>/dev/null | tr -d ' ')
  if [ -z "$COUNT" ]; then
    echo "HALT: Table $t does not exist in gda_command — migrations 057-084 may not have run"
    exit 1
  elif [ "$COUNT" != "0" ]; then
    echo "HALT: Table $t already has $COUNT rows in gda_command — data already migrated?"
    exit 1
  else
    echo "$t: 0 (clean)"
  fi
done
```

**Halt condition:** If ANY table already has rows, STOP — data may have been partially migrated.
If ANY table does not exist, STOP — migrations 057–084 have not been run against gda_command.

### 3d. Disk space check

```bash
echo "=== DISK SPACE ==="
df -h /
TOTAL_SIZE=$(docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -t -c "
SELECT pg_size_pretty(sum(pg_total_relation_size(quote_ident(t)))) 
FROM unnest(ARRAY['gda_opportunity_tracker','gda_capture_plans','gda_intelligence_log','gda_competitor_watchlist','gda_risk_register','opportunity_alerts','gda_competitor_cache','gda_action_items','gda_active_contracts','gda_dashboard_intel_cache','daily_trends','gda_opportunity_alerts','gda_morning_briefings','gda_learned_weights','gda_win_loss','gda_error_log','gda_saved_opportunities','gda_teaming_partners','ft_opportunity_signal','ft_signal_source','gda_embeddings','govtribe_cache','gda_wargames','gda_win_loss_db','gda_trend_arrays','gda_contacts','gda_relationships','gda_touchpoints']) AS t;")
echo "Total ADOPT table size: $TOTAL_SIZE"
echo "Largest table: gda_embeddings at 14 MB"
echo "Required free space: >= 28 MB (2x largest table)"
```

**Current state:** 140 GB free. Required: ≥28 MB. No concern.

**Halt condition:** If free space < 2x largest table (28 MB), STOP.

### 3e. FK dependency graph

Two FK chains exist within the 28-table set:

```
gda_relationships (057) ← gda_touchpoints (058)
  FK: gda_touchpoints.relationship_id → gda_relationships.id
  ON DELETE/UPDATE: NO ACTION

ft_signal_source (077) ← ft_opportunity_signal (078)
  FK: ft_opportunity_signal.source_id → ft_signal_source.source_id
  ON DELETE/UPDATE: NO ACTION
```

One inbound FK from OUTSIDE the ADOPT set:
```
gda_decision_memory.opportunity_id → gda_opportunity_tracker.id
  (gda_decision_memory is DOCUMENT-ONLY — stays in n8n DB, not migrated)
```

**Copy order must respect:** parents before children.

### 3f. pgvector extension check

```bash
echo "=== PGVECTOR CHECK ON gda-postgres ==="
docker exec gda-postgres psql -U gda -d gda_command -t -c \
  "SELECT extversion FROM pg_extension WHERE extname='vector';"
# Expected: 0.8.2

docker exec gda-postgres psql -U gda -d gda_command -t -c \
  "SELECT column_name, data_type FROM information_schema.columns 
   WHERE table_name='gda_embeddings' AND column_name='embedding';"
# Expected: embedding | USER-DEFINED (vector type)
```

**Halt condition:** If pgvector not installed or version ≠ 0.8.2, STOP.

---

## 4. Cross-Network Reachability

### Current topology

```
┌──────────────────────────────────────┐
│  n8n-envision_envision-internal      │
│  - n8n-envision-postgres-1           │  ← SOURCE (n8n DB with shadow tables)
│  - n8n-envision-n8n-1                │
│  - n8n-envision-redis-1              │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│  gda-command-v2_gda + n8n_default    │
│  - gda-postgres                      │  ← TARGET (gda_command DB)
│  - gda-backend                       │
│  - gda-frontend                      │
│  - gda-postgres-staging              │
└──────────────────────────────────────┘
```

**Problem:** `gda-postgres` and `n8n-envision-postgres-1` share NO Docker network.
Cross-container DNS fails: `gda-postgres` cannot resolve `n8n-envision-postgres-1`.

### Evaluated approaches

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **(a) Bridge container** — add a container to both networks | Direct SQL, no temp files | Adds infra; fragile if networks change | REJECTED |
| **(b) pg_dump/pg_restore over VPS host** | Proven pattern (used in F-036), no network changes | Temp dump files on host disk | **SELECTED** |
| **(c) postgres_fdw / dblink** | Direct SQL across DBs | Requires network bridging (same problem as option a) | REJECTED |
| **(d) Add n8n-envision-postgres-1 to n8n_default** | Simple network addition | Modifies n8n infrastructure, blast radius | REJECTED |

### Selected: Option (b) — pg_dump/pg_restore over VPS host

The migration script runs on the VPS host and uses `docker exec` for both source and target:

- **Source** (`n8n-envision-postgres-1`): Accessible via `docker exec` or host port `127.0.0.1:5432`
- **Target** (`gda-postgres`): Accessible via `docker exec` only (no host port mapping)

Per-table flow:
```
1. docker exec n8n-envision-postgres-1 pg_dump -U n8n -d n8n \
     --table=<table> --data-only --no-owner --no-privileges --format=custom \
     -f /tmp/<table>.dump

2. docker cp n8n-envision-postgres-1:/tmp/<table>.dump /tmp/step3-dumps/<table>.dump

3. docker cp /tmp/step3-dumps/<table>.dump gda-postgres:/tmp/<table>.dump

4. docker exec gda-postgres pg_restore -U gda -d gda_command \
     --data-only --no-owner --no-privileges --single-transaction \
     /tmp/<table>.dump

5. Sync SERIAL sequences to MAX(id) (see Section 5, design decision #8)
6. Verify row count matches source
7. Clean up temp files on both containers and host
```

This is the same pattern used for F-036 staging population, which was tested end-to-end.

**Tradeoff analysis:**
- Disk overhead: ~20 MB of temp dump files (trivial given 140 GB free)
- Atomicity: `pg_restore --single-transaction` ensures each table copy is all-or-nothing
- Idempotency: Script checks if table has rows before copying; skips if already populated
- Speed: 28 tables × ~20 MB total = ~1 minute end-to-end based on staging experience

---

## 5. Migration Script Design

**Location:** `scripts/f026/step3-data-migration.sh`  
**Language:** Bash with psql/pg_dump/pg_restore (no Python dependency needed)  
**Invocation:** `/root/scripts/f026/step3-data-migration.sh --target=staging|prod`

### Key design decisions

1. **`--target` flag required, no default.** Script refuses to run without explicit target.
   - `--target=staging`: source=`gda-postgres-staging` (n8n_staging), target=`gda-postgres-staging` (gda_command_staging)
   - `--target=prod`: source=`n8n-envision-postgres-1` (n8n), target=`gda-postgres` (gda_command)

2. **Idempotent with strict validation.** Before copying each table, the script checks
   both source and target counts and follows this decision tree:

   ```
   target_count = SELECT count(*) FROM <table> ON TARGET
   source_count = SELECT count(*) FROM <table> ON SOURCE

   IF target_count == 0:
       → COPY (normal path — table is empty, proceed with pg_dump/pg_restore)
   ELSE IF target_count == source_count:
       → SKIP with log: "<table>: skipped (target count N == source count N)"
   ELSE:
       → HALT with error: "<table>: target has <target_count> rows but source has
         <source_count> — partial migration detected, manual investigation required"
         Exit non-zero immediately. Do NOT continue to next table.
   ```

   This ensures:
   - Clean first run: all tables copied (target_count == 0 for all)
   - Clean re-run after success: all tables skipped (target == source for all)
   - Partial failure detected: any table with data that doesn't match source is
     an error, not a table to silently skip. Requires manual TRUNCATE + re-run
     or investigation before continuing.

3. **Transactional per-table.** Each `pg_restore` uses `--single-transaction`. If any row
   fails to insert, the entire table copy rolls back. The script logs the failure and continues
   to the next table (collecting all failures), then exits non-zero with a summary.

4. **FK-ordered.** Tables are processed in this exact order (parents before children):

   ```
   # Phase 1: FK parents (must exist before children)
   gda_relationships       # 057 — FK parent of gda_touchpoints
   ft_signal_source        # 077 — FK parent of ft_opportunity_signal

   # Phase 2: FK children
   gda_touchpoints         # 058 — FK child of gda_relationships
   ft_opportunity_signal   # 078 — FK child of ft_signal_source

   # Phase 3: All other tables (no FK dependencies, any order)
   gda_risk_register       # 059
   gda_opportunity_tracker # 060
   gda_capture_plans       # 061
   gda_intelligence_log    # 062
   gda_competitor_watchlist# 063
   opportunity_alerts      # 064
   gda_competitor_cache    # 065
   gda_action_items        # 066
   gda_active_contracts    # 067
   gda_dashboard_intel_cache # 068
   daily_trends            # 069
   gda_opportunity_alerts  # 070
   gda_morning_briefings   # 071
   gda_learned_weights     # 072
   gda_win_loss            # 073
   gda_error_log           # 074
   gda_saved_opportunities # 075
   gda_teaming_partners    # 076
   gda_embeddings          # 079 — pgvector, vector(1536)
   govtribe_cache          # 080
   gda_wargames            # 081
   gda_win_loss_db         # 082
   gda_trend_arrays        # 083
   gda_contacts            # 084 — PII (email, phone)
   ```

5. **pgvector-aware.** Before copying `gda_embeddings`, the script:
   - Verifies pgvector extension exists on target: `SELECT extversion FROM pg_extension WHERE extname='vector';`
   - Verifies the `embedding` column type matches: both must be `vector(1536)`
   - If either check fails, HALT with a clear error

6. **Sequence synchronization.** After each table restore, sync SERIAL sequences to avoid
   PK conflicts when Step 4 repoints workflows and they start INSERTing new rows:
   ```sql
   -- For each table with a SERIAL/IDENTITY PK (all 27 except gda_trend_arrays which uses VARCHAR PK):
   -- Uses 3-argument setval: setval(seq, val, is_called)
   -- When table is empty (MAX(id) IS NULL), sets to 1 with is_called=false so nextval() returns 1.
   -- When table has data, sets to MAX(id) with is_called=true so nextval() returns MAX(id)+1.
   SELECT setval(
     pg_get_serial_sequence('<table>', 'id'),
     COALESCE((SELECT MAX(id) FROM <table>), 1),
     (SELECT MAX(id) FROM <table>) IS NOT NULL
   );
   ```
   `gda_trend_arrays` uses `metric_name VARCHAR` as its PK (natural key, no sequence) — skipped.
   Without this step, sequences on gda_command would remain at their default start value (1),
   causing duplicate PK errors on the first INSERT after Step 4 credential repoint.

7. **Verbose logging.** All output logged to `/var/log/f026-step3-migration-<target>-<timestamp>.log`
   with ISO timestamps. Log includes:
   - Pre-flight check results
   - Per-table: source count, dump size, restore result, target count, PASS/FAIL
   - Summary: total tables, passed, failed, skipped

8. **Configurable containers.** For staging mode, the script adjusts container names and
   database names:

   | Parameter | `--target=staging` | `--target=prod` |
   |-----------|-------------------|-----------------|
   | Source container | `gda-postgres-staging` | `n8n-envision-postgres-1` |
   | Source DB | `n8n_staging` | `n8n` |
   | Source user | `gda_staging` | `n8n` |
   | Target container | `gda-postgres-staging` | `gda-postgres` |
   | Target DB | `gda_command_staging` | `gda_command` |
   | Target user | `gda_staging` | `gda` |

---

## 6. Row-Count Verification

After each table copy, the script verifies:

```bash
SOURCE_COUNT=$(docker exec $SOURCE_CONTAINER psql -U $SOURCE_USER -d $SOURCE_DB -t -c \
  "SELECT count(*) FROM $TABLE;" | tr -d ' ')
TARGET_COUNT=$(docker exec $TARGET_CONTAINER psql -U $TARGET_USER -d $TARGET_DB -t -c \
  "SELECT count(*) FROM $TABLE;" | tr -d ' ')

if [ "$SOURCE_COUNT" != "$TARGET_COUNT" ]; then
  echo "FAIL: $TABLE — source=$SOURCE_COUNT target=$TARGET_COUNT"
  FAILURES+=("$TABLE")
fi
```

**Exact match required.** Not "within 1%" — exact. The source tables are not being written to
during the migration window (workflows still point at n8n DB using the old credential, and
the migration script only READs from source).

For tables with timestamp columns (`updated_at`, `created_at`), also verify:

```sql
SELECT MAX(updated_at) FROM <table>;  -- or MAX(created_at) if no updated_at
```

Both source and target must return the same MAX timestamp.

**If ANY table count mismatches:**
- Log the failure
- Continue checking remaining tables (to get full picture)
- Exit non-zero with summary of all failures
- Do NOT partial-commit — the failing table was already rolled back by `--single-transaction`

---

## 7. Constraint Verification

After ALL 28 tables are successfully copied, run a full constraint check:

### 7a. FK integrity

```sql
-- Check ft_opportunity_signal → ft_signal_source
SELECT COUNT(*) FROM ft_opportunity_signal os
LEFT JOIN ft_signal_source ss ON os.source_id = ss.source_id
WHERE ss.source_id IS NULL;
-- Expected: 0 (no orphans)

-- Check gda_touchpoints → gda_relationships
SELECT COUNT(*) FROM gda_touchpoints t
LEFT JOIN gda_relationships r ON t.relationship_id = r.id
WHERE r.id IS NULL;
-- Expected: 0 (no orphans)
```

### 7b. UNIQUE constraint validation

```sql
-- For each table with a UNIQUE index, verify no duplicates
-- Example for gda_opportunity_tracker (has unique on solicitation_number):
SELECT solicitation_number, COUNT(*) 
FROM gda_opportunity_tracker 
GROUP BY solicitation_number 
HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

### 7c. NOT NULL constraint validation

```sql
-- pg_restore --single-transaction will fail on NOT NULL violations during INSERT,
-- so if the restore succeeded, NOT NULL constraints held. This is a belt-and-suspenders
-- check for any columns that might have been added since the migration ran.
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = '<table>' AND is_nullable = 'NO';
-- Cross-reference with actual NULL counts
```

### 7d. CHECK constraint validation

```sql
-- List all CHECK constraints on the 28 tables
SELECT tc.table_name, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name IN (<28 tables>) AND tc.constraint_type = 'CHECK';
-- All should be satisfied (pg_restore would have failed otherwise)
```

### 7e. Sequence synchronization verification

```sql
-- For each table with a SERIAL PK, verify sequence is set to at least MAX(id)
-- (all 27 tables except gda_trend_arrays which uses VARCHAR PK)
SELECT
  t.table_name,
  pg_get_serial_sequence(t.table_name, 'id') AS sequence_name,
  (SELECT MAX(id) FROM gda_opportunity_tracker) AS max_id,  -- example; script iterates all tables
  last_value AS sequence_value
FROM information_schema.tables t
JOIN pg_sequences ps ON ps.schemaname = 'public'
  AND ps.sequencename = (pg_get_serial_sequence(t.table_name, 'id'))::text
WHERE t.table_schema = 'public'
  AND t.table_name IN (<27 SERIAL-PK tables>);
-- Expected: sequence_value >= max_id for every table
```

**Halt condition:** If any sequence value < MAX(id), the sequence was not synced — fix before
proceeding to Step 4.

### 7f. pgvector index on gda_embeddings

```sql
-- Verify the IVFFlat index exists and is usable
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'gda_embeddings';
-- Expected: idx_gda_embeddings_vector USING ivfflat (embedding vector_cosine_ops) WITH (lists='27')

-- Test a vector query (proves index is built and queryable)
SELECT id, 1 - (embedding <=> (SELECT embedding FROM gda_embeddings LIMIT 1)) AS similarity
FROM gda_embeddings
ORDER BY embedding <=> (SELECT embedding FROM gda_embeddings LIMIT 1)
LIMIT 3;
-- Expected: Returns 3 rows with similarity scores (first row should be 1.0 = self-match)
```

---

## 8. Rollback Plan

If Step 3 needs to be undone at any point:

### 8a. Truncate all 28 ADOPT tables on gda_command

```bash
ADOPT_TABLES="gda_touchpoints gda_relationships ft_opportunity_signal ft_signal_source gda_risk_register gda_opportunity_tracker gda_capture_plans gda_intelligence_log gda_competitor_watchlist opportunity_alerts gda_competitor_cache gda_action_items gda_active_contracts gda_dashboard_intel_cache daily_trends gda_opportunity_alerts gda_morning_briefings gda_learned_weights gda_win_loss gda_error_log gda_saved_opportunities gda_teaming_partners gda_embeddings govtribe_cache gda_wargames gda_win_loss_db gda_trend_arrays gda_contacts"

# TRUNCATE in reverse FK order (children first)
docker exec gda-postgres psql -U gda -d gda_command -c "
BEGIN;
TRUNCATE gda_touchpoints, ft_opportunity_signal CASCADE;
TRUNCATE gda_relationships, ft_signal_source, gda_risk_register, gda_opportunity_tracker, gda_capture_plans, gda_intelligence_log, gda_competitor_watchlist, opportunity_alerts, gda_competitor_cache, gda_action_items, gda_active_contracts, gda_dashboard_intel_cache, daily_trends, gda_opportunity_alerts, gda_morning_briefings, gda_learned_weights, gda_win_loss, gda_error_log, gda_saved_opportunities, gda_teaming_partners, gda_embeddings, govtribe_cache, gda_wargames, gda_win_loss_db, gda_trend_arrays, gda_contacts CASCADE;
COMMIT;
"
```

### 8b. Selective restore from backup (28 ADOPT tables only)

> **⚠️ WARNING: Do NOT use `--clean` against the full `gda_command` database.**
> The pre-migration backup contains ALL tables including the 89 production tables.
> A `pg_restore --clean` against the full DB would DROP and recreate everything,
> destroying production table data that may have changed since the backup.
> Only use selective per-table restore.

```bash
# The backup was taken before migration via /root/backup-before-migration.sh
ls -la /root/backups/gda_command_*.dump  # Find the pre-migration backup

# Selective restore — one table at a time, ADOPT tables ONLY
ADOPT_TABLES="gda_relationships gda_touchpoints gda_risk_register gda_opportunity_tracker gda_capture_plans gda_intelligence_log gda_competitor_watchlist opportunity_alerts gda_competitor_cache gda_action_items gda_active_contracts gda_dashboard_intel_cache daily_trends gda_opportunity_alerts gda_morning_briefings gda_learned_weights gda_win_loss gda_error_log gda_saved_opportunities gda_teaming_partners ft_signal_source ft_opportunity_signal gda_embeddings govtribe_cache gda_wargames gda_win_loss_db gda_trend_arrays gda_contacts"

docker cp /root/backups/gda_command_<timestamp>.dump gda-postgres:/tmp/gda_restore.dump

for t in $ADOPT_TABLES; do
  echo "Restoring $t from backup..."
  docker exec gda-postgres pg_restore -U gda -d gda_command \
    --data-only --no-owner --no-privileges \
    --table="$t" --single-transaction \
    /tmp/gda_restore.dump
done
```

**The 89 production tables are NEVER touched by rollback under any circumstance.**
Rollback only affects the 28 ADOPT tables. If Step 8a (TRUNCATE) succeeded, the ADOPT
tables are already clean and 8b is not needed. Use 8b only if TRUNCATE failed or if you
need to restore the ADOPT tables to their pre-migration state (which is empty — since
the tables were created empty by migrations 057–084).

### 8c. Verify original 89 tables unchanged

```bash
# Compare row counts against the pre-state file
docker exec gda-postgres psql -U gda -d gda_command -t -c "
SELECT tablename, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY tablename;"

# Diff against /root/f026-step3-gda-command-prestate.txt
```

### 8d. Confirm no workflow repointing happened

Since Step 3 does not modify credentials, no workflow should have been pointed at gda_command.
Verify by checking the "GDA Postgres" credential still points at `n8n-envision-postgres-1`:

```bash
# Via n8n API — check credential host
curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
  http://localhost:5678/api/v1/credentials/HwronxMmGY5XDGEt | jq '.data.host'
# Expected: "n8n-envision-postgres-1" (unchanged)
```

---

## 9. Staging Rehearsal Procedure

### 9a. Refresh staging

```bash
/root/refresh-staging.sh
# Wait for completion — typically ~30 seconds
# Verify log shows "all checks passed"
```

### 9b. Run migration against staging

```bash
# Deploy migration script to VPS (from repo)
scp scripts/f026/step3-data-migration.sh root@$VPS_HOST:/root/scripts/f026/

# Execute
/root/scripts/f026/step3-data-migration.sh --target=staging
```

### 9c. Verify all row counts, constraints, indexes

```bash
# The script's built-in verification covers this, but also run the constraint
# checks from Section 7 manually against staging:

docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging -c "
-- FK check: ft_opportunity_signal → ft_signal_source
SELECT COUNT(*) AS orphan_fk_signals FROM ft_opportunity_signal os
LEFT JOIN ft_signal_source ss ON os.source_id = ss.source_id
WHERE ss.source_id IS NULL;

-- FK check: gda_touchpoints → gda_relationships
SELECT COUNT(*) AS orphan_fk_touchpoints FROM gda_touchpoints t
LEFT JOIN gda_relationships r ON t.relationship_id = r.id
WHERE r.id IS NULL;
"

# pgvector query test
docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging -c "
SELECT id, 1 - (embedding <=> (SELECT embedding FROM gda_embeddings LIMIT 1)) AS similarity
FROM gda_embeddings
ORDER BY embedding <=> (SELECT embedding FROM gda_embeddings LIMIT 1)
LIMIT 3;
"
```

### 9d. Representative SELECT queries

Run a sample query against each of the 28 tables to confirm data is readable:

```bash
TABLES="gda_relationships gda_touchpoints gda_risk_register gda_opportunity_tracker gda_capture_plans gda_intelligence_log gda_competitor_watchlist opportunity_alerts gda_competitor_cache gda_action_items gda_active_contracts gda_dashboard_intel_cache daily_trends gda_opportunity_alerts gda_morning_briefings gda_learned_weights gda_win_loss gda_error_log gda_saved_opportunities gda_teaming_partners ft_signal_source ft_opportunity_signal gda_embeddings govtribe_cache gda_wargames gda_win_loss_db gda_trend_arrays gda_contacts"

for t in $TABLES; do
  echo "--- $t ---"
  docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging -c \
    "SELECT * FROM $t LIMIT 1;" 2>&1 | head -5
done
```

### 9e. Generate parity report

```bash
echo "=== STAGING REHEARSAL PARITY REPORT ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""
echo "| Table | Source (n8n_staging) | Target (gda_command_staging) | Match |"
echo "|-------|--------------------|-----------------------------|-------|"

for t in $TABLES; do
  SRC=$(docker exec gda-postgres-staging psql -U gda_staging -d n8n_staging -t -c \
    "SELECT count(*) FROM $t;" | tr -d ' ')
  TGT=$(docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging -t -c \
    "SELECT count(*) FROM $t;" | tr -d ' ')
  if [ "$SRC" = "$TGT" ]; then
    echo "| $t | $SRC | $TGT | EXACT |"
  else
    echo "| $t | $SRC | $TGT | **MISMATCH** |"
  fi
done
```

**Halt condition:** ANY mismatch → STOP and report.

### 9f. Idempotency test — tear down and re-run (proves "from scratch" repeatability)

```bash
# Truncate all 28 ADOPT tables on gda_command_staging
docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging -c "
BEGIN;
TRUNCATE gda_touchpoints, ft_opportunity_signal CASCADE;
TRUNCATE gda_relationships, ft_signal_source, gda_risk_register, gda_opportunity_tracker, gda_capture_plans, gda_intelligence_log, gda_competitor_watchlist, opportunity_alerts, gda_competitor_cache, gda_action_items, gda_active_contracts, gda_dashboard_intel_cache, daily_trends, gda_opportunity_alerts, gda_morning_briefings, gda_learned_weights, gda_win_loss, gda_error_log, gda_saved_opportunities, gda_teaming_partners, gda_embeddings, govtribe_cache, gda_wargames, gda_win_loss_db, gda_trend_arrays, gda_contacts CASCADE;
COMMIT;
"

# Re-run migration
/root/scripts/f026/step3-data-migration.sh --target=staging

# Generate second parity report — must match first exactly
```

**Halt condition:** Second rehearsal produces different results than first → STOP.

### 9g. Idempotency test — re-run on fully populated target (proves true idempotency)

After 9f completes successfully (all 28 tables populated, parity confirmed), run the
script a **third time WITHOUT truncating** first:

```bash
# Run migration again — target already has all data from 9f
/root/scripts/f026/step3-data-migration.sh --target=staging
```

**Expected result:**
- All 28 tables report: `skipped (target count N == source count N)`
- Zero tables copied, zero errors
- Script exits 0 with log summary: `28 skipped, 0 copied, 0 failed`
- No row count changes on any table

**This is the real idempotency proof.** Steps 9b and 9f prove the script can populate
empty tables. Step 9g proves the script is safe to re-run on a fully-populated target
without duplicating data, truncating, or erroring — which is exactly what happens if
someone accidentally runs it twice in production.

**Halt condition:** If ANY table is copied (not skipped), or any error occurs → STOP.
The script should make zero changes on this run.

### 9h. Save rehearsal reports

All three parity reports saved to:
- `docs/audits/f026-step3-staging-rehearsal-<timestamp>.md`
- Report must include: Run 1 (fresh), Run 2 (post-truncate), Run 3 (idempotency re-run)

---

## 9½. Execution Timing — Cron Pause for Migration Window

### Problem

Active n8n workflows are continuously writing to the 28 ADOPT tables on `n8n-envision-postgres-1`.
If a workflow INSERTs or UPDATEs rows during the pg_dump window, the source row count captured
pre-migration may not match the dump contents, causing false row-count mismatches or inconsistent
data. Pausing all writer workflows eliminates this drift window entirely.

### 9½a. Inventory of workflows writing to ADOPT tables

Based on write activity analysis (F-023 shadow schema audit, pg_stat_user_tables) and F-023b
workflow lineage, the following active workflows WRITE to ADOPT tables:

| # | Workflow | ID | Trigger | Tables Written | Write Type |
|---|----------|----|---------|---------------|------------|
| 1 | GDA.cron.auto-risk-generation | ldVAxgDGuKJx4354 | cron | gda_risk_register | DDL+WRITE (UPSERT) |
| 2 | GDA.cron.deadline-escalation | Qg55lRKjubgsvD28 | cron | gda_risk_register | WRITE+DDL (UPDATE) |
| 3 | GDA.cron.pipeline-health-digest | 9annZcPoqw0DaPKI | cron | gda_risk_register | READ+WRITE |
| 4 | GDA.cron.sam-sync | — | cron | gda_opportunity_tracker | INSERT+UPDATE (488i/1,314u) |
| 5 | GDA.cron.fast-track-ingest | — | cron | ft_signal_source, ft_opportunity_signal | INSERT+UPDATE |
| 6 | GDA.cron.data-sync | — | cron | daily_trends, gda_trend_arrays, gda_learned_weights | INSERT+UPDATE |
| 7 | GDA.cron.auto-capture-plan | — | cron | gda_capture_plans | UPDATE |
| 8 | GDA.cron.comp-intel 2 | — | cron | gda_competitor_cache, gda_competitor_watchlist | INSERT+UPDATE |
| 9 | GDA.cron.auto-opp-analysis | — | cron | gda_intelligence_log, gda_action_items | INSERT+DELETE |
| 10 | GDA.cron.change-detector | — | cron | gda_opportunity_alerts, opportunity_alerts | INSERT |
| 11 | GDA.cron.health-scan-daily | — | cron | gda_error_log | INSERT |
| 12 | GDA.api.intel-feed | — | cron | gda_dashboard_intel_cache, gda_morning_briefings | INSERT+DELETE |
| 13 | GDA.cron.stage-auto-promote | — | cron | gda_opportunity_tracker | UPDATE |
| 14 | (any webhook writing to ADOPT tables) | — | webhook | varies | varies |

**Tables with zero write activity:** gda_relationships, gda_touchpoints, gda_saved_opportunities,
govtribe_cache, gda_wargames, gda_contacts, gda_active_contracts, gda_win_loss, gda_win_loss_db,
gda_teaming_partners, gda_embeddings. These are safe but we pause all writers as a precaution.

### 9½b. Pause writer workflows before migration

```bash
# Pause all active cron workflows that write to ADOPT tables
# Uses n8n REST API: PATCH /workflows/{id} with { "active": false }

WRITER_WF_IDS="ldVAxgDGuKJx4354 Qg55lRKjubgsvD28 9annZcPoqw0DaPKI"
# Add remaining IDs after verifying from pre-flight workflow scan

echo "=== PAUSING WRITER WORKFLOWS ==="
for wf_id in $WRITER_WF_IDS; do
  echo "Pausing workflow $wf_id..."
  curl -s -X PATCH "http://localhost:5678/api/v1/workflows/$wf_id" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"active": false}' | jq -r '.name + ": " + (.active|tostring)'
done

echo "=== WAITING 30s FOR IN-FLIGHT EXECUTIONS TO DRAIN ==="
sleep 30

echo "=== VERIFYING ALL WRITER WORKFLOWS ARE INACTIVE ==="
for wf_id in $WRITER_WF_IDS; do
  ACTIVE=$(curl -s "http://localhost:5678/api/v1/workflows/$wf_id" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" | jq -r '.active')
  echo "$wf_id: active=$ACTIVE"
  if [ "$ACTIVE" = "true" ]; then
    echo "HALT: Workflow $wf_id did not deactivate"
    exit 1
  fi
done
```

**Halt condition:** If any workflow fails to deactivate → STOP.

### 9½c. Run migration (with writers paused)

Execute the migration script (Section 10c for prod, Section 9b for staging).
All pg_dump operations now capture consistent snapshots because no workflows
are writing to the source tables.

### 9½d. Unpause writer workflows after migration

```bash
echo "=== UNPAUSING WRITER WORKFLOWS ==="
for wf_id in $WRITER_WF_IDS; do
  echo "Unpausing workflow $wf_id..."
  curl -s -X PATCH "http://localhost:5678/api/v1/workflows/$wf_id" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"active": true}' | jq -r '.name + ": " + (.active|tostring)'
done
```

### 9½e. Verify unpaused workflows fire successfully

```bash
# Wait for the next scheduled execution of each unpaused workflow
# Check execution log after the expected fire time

echo "=== POST-UNPAUSE VERIFICATION ==="
sleep 120  # Wait 2 minutes for next cron cycles

for wf_id in $WRITER_WF_IDS; do
  LAST=$(curl -s "http://localhost:5678/api/v1/executions?workflowId=$wf_id&limit=1" \
    -H "X-N8N-API-KEY: $N8N_API_KEY" | jq -r '.data[0].status')
  echo "$wf_id: last execution status=$LAST"
done
```

**Missed executions during pause:** Cron workflows paused for ~5–10 minutes may miss one
scheduled execution. This is recoverable — the next scheduled run catches up. A missed
execution is far less risky than a row-count drift during migration. Log any missed
executions in the migration report.

### Staging note

For staging rehearsal (Section 9), the cron pause is not strictly required because
`n8n_staging` is a snapshot and no live workflows write to it. However, the pause/unpause
procedure should be rehearsed once during staging (using staging workflow IDs if they exist,
or simulated) to validate the API calls work before doing it in production.

---

## 10. Production Execution Procedure

**Only after staging rehearsal passes all three runs (9b, 9f, 9g) and architect approves.**

### 10a. Backup

```bash
/root/backup-before-migration.sh gda_command
# Verify: ls -la /root/backups/gda_command_*.dump
```

### 10b. Pre-state capture

Run all commands from Section 3 above. Save to `/root/f026-step3-pre-state-<timestamp>.txt`.

### 10c. Execute migration

```bash
/root/scripts/f026/step3-data-migration.sh --target=prod
```

### 10d. Verify row counts, constraints, indexes

Same verification as staging (Section 7), but against production `gda_command`:

```bash
# Row counts
TABLES="gda_relationships gda_touchpoints gda_risk_register gda_opportunity_tracker ..."

for t in $TABLES; do
  SRC=$(docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -t -c \
    "SELECT count(*) FROM $t;" | tr -d ' ')
  TGT=$(docker exec gda-postgres psql -U gda -d gda_command -t -c \
    "SELECT count(*) FROM $t;" | tr -d ' ')
  echo "$t: source=$SRC target=$TGT match=$([ "$SRC" = "$TGT" ] && echo YES || echo NO)"
done

# FK checks (same as Section 7a)
# pgvector query test (same as Section 7e)
```

### 10e. Representative SELECT queries

Same as staging (Section 9d), but against prod `gda_command`.

### 10f. Generate production parity report

```bash
echo "=== PRODUCTION PARITY REPORT ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
# ... same format as staging report ...
```

Save to: `docs/audits/f026-step3-prod-execution-<timestamp>.md`

### 10g. Production health checks

```bash
# Backend health
curl -s https://gda.csr-llc.tech/api/health
# Expected: 200

# n8n health
curl -s https://n8n.csr-llc.tech/healthz
# Expected: healthy

# Canary workflows still running (system-watchdog, change-detector)
# Check n8n execution log for last 10 minutes — should show green executions

# gda_command original 89 tables unchanged
diff <(cat /root/f026-step3-gda-command-prestate.txt) \
     <(docker exec gda-postgres psql -U gda -d gda_command -t -c \
       "SELECT tablename, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY tablename;")
# Expected: Only the 28 ADOPT tables should differ (they now have data)
```

### 10h. HALT — Architect review

**STOP. Ping architect with the production parity report before considering Step 3 complete.**

---

## Halt Conditions (consolidated)

Any of these means STOP IMMEDIATELY, do not proceed:

| # | Condition | Detection point |
|---|-----------|----------------|
| 1 | Any of the 28 ADOPT table names already have data in gda_command | Pre-flight 3c |
| 2 | Disk space < 28 MB free | Pre-flight 3d |
| 3 | pgvector not installed or version ≠ 0.8.2 on gda-postgres | Pre-flight 3f |
| 4 | Migrations 057–084 not run (tables don't exist in gda_command) | Pre-flight 3c |
| 5 | Staging rehearsal row counts don't match exactly | Rehearsal 9e |
| 6 | Second staging rehearsal produces different results than first | Rehearsal 9f |
| 7 | Any FK orphan after migration | Constraint check 7a |
| 8 | Any UNIQUE/NOT NULL/CHECK constraint violation | Constraint check 7b/c/d |
| 9 | pgvector dimension mismatch on gda_embeddings | Migration script pre-check |
| 10 | pgvector index not queryable after migration | Constraint check 7e |
| 11 | Any unexpected change to gda_command's original 89 tables | Post-migration 10g |
| 12 | Any n8n workflow execution failure during/after migration | Post-migration 10g |
| 13 | Production parity report shows any mismatch | Post-migration 10f |

---

## What This Step Does NOT Do

- Does **NOT** repoint workflows from n8n DB to gda_command (Step 4)
- Does **NOT** drop shadow tables from n8n DB (Step 5)
- Does **NOT** make any schema changes (migrations 057–084 already define the schema)
- Does **NOT** modify n8n's internal `n8n` database
- Does **NOT** touch credentials `yK1VVsSN3tn0baVm` or `HwronxMmGY5XDGEt`
- Does **NOT** address compose drift (F-037)
- Does **NOT** modify any n8n workflow JSON
- Does **NOT** affect the 36 DOCUMENT-ONLY shadow tables (they stay in n8n DB)

---

## Execution Timing

**Proposed window:** After staging rehearsal is approved by architect.

Rationale:
- Step 3 only READS from n8n DB and WRITES to empty tables in gda_command
- No workflows are repointed, so there is no consumer conflict
- The n8n DB shadow tables continue to be the active source-of-truth until Step 4
- Risk is low because the operation is purely additive to gda_command
- However, scheduling during a quiet window is still preferred to avoid row-count drift
  between source capture and verification (if a workflow writes to a shadow table mid-migration)

**Recommended:** Execute during the same quiet window used for F-026 Step 2 (after Tier 0
closes, between morning and evening cron waves). ~15:00 UTC.

---

## Appendix: Full Table List with Copy Order

| Phase | Order | Table | Migration | Rows | Size | FK Role |
|-------|-------|-------|-----------|------|------|---------|
| 1 (parents) | 1 | gda_relationships | 057 | 0 | 16 kB | FK parent |
| 1 (parents) | 2 | ft_signal_source | 077 | 10 | 48 kB | FK parent |
| 2 (children) | 3 | gda_touchpoints | 058 | 0 | 8 kB | FK child → gda_relationships |
| 2 (children) | 4 | ft_opportunity_signal | 078 | 234 | 256 kB | FK child → ft_signal_source |
| 3 (independent) | 5 | gda_risk_register | 059 | 464 | 488 kB | — |
| 3 (independent) | 6 | gda_opportunity_tracker | 060 | 1,780 | 1,728 kB | — |
| 3 (independent) | 7 | gda_capture_plans | 061 | 110 | 696 kB | — |
| 3 (independent) | 8 | gda_intelligence_log | 062 | 54 | 136 kB | — |
| 3 (independent) | 9 | gda_competitor_watchlist | 063 | 46 | 184 kB | — |
| 3 (independent) | 10 | opportunity_alerts | 064 | 2 | 216 kB | — |
| 3 (independent) | 11 | gda_competitor_cache | 065 | 1 | 168 kB | — |
| 3 (independent) | 12 | gda_action_items | 066 | 47 | 584 kB | — |
| 3 (independent) | 13 | gda_active_contracts | 067 | 5 | 32 kB | — |
| 3 (independent) | 14 | gda_dashboard_intel_cache | 068 | 6 | 200 kB | — |
| 3 (independent) | 15 | daily_trends | 069 | 537 | 200 kB | — |
| 3 (independent) | 16 | gda_opportunity_alerts | 070 | 7 | 112 kB | — |
| 3 (independent) | 17 | gda_morning_briefings | 071 | 40 | 264 kB | — |
| 3 (independent) | 18 | gda_learned_weights | 072 | 18 | 64 kB | — |
| 3 (independent) | 19 | gda_win_loss | 073 | 6 | 64 kB | — |
| 3 (independent) | 20 | gda_error_log | 074 | 334 | 88 kB | — |
| 3 (independent) | 21 | gda_saved_opportunities | 075 | 0 | 40 kB | — |
| 3 (independent) | 22 | gda_teaming_partners | 076 | 12 | 80 kB | — |
| 3 (independent) | 23 | gda_embeddings | 079 | 821 | 14 MB | pgvector |
| 3 (independent) | 24 | govtribe_cache | 080 | 0 | — | — |
| 3 (independent) | 25 | gda_wargames | 081 | 1 | — | — |
| 3 (independent) | 26 | gda_win_loss_db | 082 | 10 | — | — |
| 3 (independent) | 27 | gda_trend_arrays | 083 | 15 | — | — |
| 3 (independent) | 28 | gda_contacts | 084 | 2 | 80 kB | PII |

**Total: 4,562 rows, ~20 MB**
