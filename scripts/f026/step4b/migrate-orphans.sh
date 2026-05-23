#!/usr/bin/env bash
set -euo pipefail

# F-026 Step 4b — Orphan Table Migration: 6 tables n8n DB → gda_command
# Per approved plan: docs/f026/step4b/PLAN.md (PR #306)
#
# Design decisions implemented:
#   1. --target flag required (staging|prod), no default
#   2. 3-way idempotency: copy if target==0 && source>0, skip if target==source,
#      skip if both==0, HALT if target!=0 && target!=source
#   3. Transactional per-table (pg_restore --single-transaction)
#   4. FK ordering: gda_decision_memory last (FK → gda_opportunity_tracker)
#   5. Sequence sync via COALESCE(MAX(id), 1) per table
#   6. FK validation check on gda_decision_memory post-import
#   7. UNIQUE constraint post-check (2 tables)
#   8. Host-side curl for n8n API (BUG-7: no BusyBox wget)
#   9. Full credential JSON for PATCH calls (BUG-8)
#  10. Backend service name = "backend" (BUG-9)
#  11. Pause/unpause via n8n API — canary LPUSYd4Vpph1Qg7n stays active
#  12. All timestamps in EST

# ─── Parse arguments ───────────────────────────────────────────────────────────

TARGET=""
for arg in "$@"; do
  case "$arg" in
    --target=staging) TARGET="staging" ;;
    --target=prod)    TARGET="prod" ;;
    --target=*)
      echo "ERROR: Invalid target '${arg#--target=}'. Must be 'staging' or 'prod'."
      exit 1
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "ERROR: --target flag is required. Usage: $0 --target=staging|prod"
  exit 1
fi

# ─── Configure containers per target ──────────────────────────────────────────

if [ "$TARGET" = "staging" ]; then
  SRC_CONTAINER="gda-postgres-staging"
  SRC_DB="n8n_staging"
  SRC_USER="gda_staging"
  TGT_CONTAINER="gda-postgres-staging"
  TGT_DB="gda_command_staging"
  TGT_USER="gda_staging"
  N8N_PORT="5679"
  N8N_AUTH_METHOD="cookie"
  N8N_LOGIN_EMAIL="staging@test.local"
  N8N_LOGIN_PASS="StagePass123!"
else
  SRC_CONTAINER="n8n-envision-postgres-1"
  SRC_DB="n8n"
  SRC_USER="n8n"
  TGT_CONTAINER="gda-postgres"
  TGT_DB="gda_command"
  TGT_USER="gda"
  N8N_PORT="5678"
  N8N_AUTH_METHOD="apikey"
  N8N_API_KEY=$(grep N8N_API_KEY /root/n8n-envision/.env | cut -d= -f2 | tr -d '"' | tr -d "'")
fi

# ─── Logging (EST timestamps) ─────────────────────────────────────────────────

TIMESTAMP=$(TZ=America/New_York date +%Y%m%dT%H%M%S)
LOGFILE="/var/log/f026-step4b-migration-${TARGET}-${TIMESTAMP}.log"
DUMP_DIR="/tmp/step4b-dumps-${TIMESTAMP}"
mkdir -p "$DUMP_DIR"

log() {
  local msg="[$(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')] $1"
  echo "$msg" | tee -a "$LOGFILE"
}

log "═══════════════════════════════════════════════════════════════"
log "F-026 Step 4b — Orphan Table Migration (target=$TARGET)"
log "Source: $SRC_CONTAINER / $SRC_DB (user: $SRC_USER)"
log "Target: $TGT_CONTAINER / $TGT_DB (user: $TGT_USER)"
log "Log: $LOGFILE"
log "Dump dir: $DUMP_DIR"
log "═══════════════════════════════════════════════════════════════"

# ─── Table list (ordered: gda_decision_memory last for FK) ─────────────────────

TABLES=(
  gda_pattern_library
  gda_stage_audit
  gda_content_store
  gda_data_lake
  gda_interaction_log
  gda_decision_memory
)

# ─── Helper: n8n API call (host-side curl, BUG-7) ─────────────────────────────

n8n_api() {
  local METHOD="$1"
  local ENDPOINT="$2"
  local DATA="${3:-}"

  if [ "$N8N_AUTH_METHOD" = "cookie" ]; then
    if [ -n "$DATA" ]; then
      curl -s --fail-with-body -b /tmp/n8n_staging_cookies -X "$METHOD" \
        "http://localhost:${N8N_PORT}/rest${ENDPOINT}" \
        -H "Content-Type: application/json" \
        -d "$DATA" 2>/dev/null
    else
      curl -s --fail-with-body -b /tmp/n8n_staging_cookies \
        "http://localhost:${N8N_PORT}/rest${ENDPOINT}" 2>/dev/null
    fi
  else
    if [ -n "$DATA" ]; then
      curl -s --fail-with-body -X "$METHOD" \
        -H "accept: application/json" \
        -H "Content-Type: application/json" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -d "$DATA" \
        "http://localhost:${N8N_PORT}/api/v1${ENDPOINT}" 2>/dev/null
    else
      curl -s --fail-with-body \
        -H "accept: application/json" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        "http://localhost:${N8N_PORT}/api/v1${ENDPOINT}" 2>/dev/null
    fi
  fi
}

# ─── Helper: run SQL on source ─────────────────────────────────────────────────

src_sql() {
  docker exec "$SRC_CONTAINER" psql -U "$SRC_USER" -d "$SRC_DB" -t -c "$1" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# ─── Helper: run SQL on target ─────────────────────────────────────────────────

tgt_sql() {
  docker exec "$TGT_CONTAINER" psql -U "$TGT_USER" -d "$TGT_DB" -t -c "$1" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# ─── Cookie login for staging ──────────────────────────────────────────────────

if [ "$N8N_AUTH_METHOD" = "cookie" ]; then
  log "Attempting staging n8n login..."
  if curl -s --fail-with-body -c /tmp/n8n_staging_cookies -X POST \
    "http://localhost:${N8N_PORT}/rest/login" \
    -H "Content-Type: application/json" \
    -d "{\"emailOrLdapLoginId\":\"$N8N_LOGIN_EMAIL\",\"password\":\"$N8N_LOGIN_PASS\"}" > /dev/null 2>&1; then
    log "Staging n8n login OK"
    N8N_AVAILABLE=true
  else
    log "WARNING: Staging n8n not available — workflow pause/unpause will be skipped"
    N8N_AVAILABLE=false
  fi
else
  N8N_AVAILABLE=true
fi

# ─── PHASE 0: PRE-FLIGHT ──────────────────────────────────────────────────────

log ""
log "══ PHASE 0: PRE-FLIGHT ══"

# 0a. Verify 6 source tables exist
log ""
log "── 0a. Source table check (6 tables) ──"
SRC_MISSING=0
for TABLE in "${TABLES[@]}"; do
  EXISTS=$(src_sql "SELECT to_regclass('public.${TABLE}');")
  if [ "$EXISTS" = "" ] || [ "$EXISTS" = "" ] || [ -z "$EXISTS" ]; then
    log "  MISSING: $TABLE on source"
    SRC_MISSING=$((SRC_MISSING + 1))
  else
    log "  OK: $TABLE"
  fi
done
if [ "$SRC_MISSING" -gt 0 ]; then
  log "HALT: $SRC_MISSING source tables missing"
  exit 1
fi

# 0b. Verify 6 target tables exist (from migration 115-120)
log ""
log "── 0b. Target table check (6 tables) ──"
TGT_MISSING=0
for TABLE in "${TABLES[@]}"; do
  EXISTS=$(tgt_sql "SELECT to_regclass('public.${TABLE}');")
  if [ "$EXISTS" = "" ] || [ "$EXISTS" = "" ] || [ -z "$EXISTS" ]; then
    log "  MISSING: $TABLE on target"
    TGT_MISSING=$((TGT_MISSING + 1))
  else
    log "  OK: $TABLE"
  fi
done
if [ "$TGT_MISSING" -gt 0 ]; then
  log "HALT: $TGT_MISSING target tables missing — run migrations 115-120 first"
  exit 1
fi

# 0c. FK prerequisite: gda_opportunity_tracker must exist on target
log ""
log "── 0c. FK prerequisite check ──"
OPP_EXISTS=$(tgt_sql "SELECT to_regclass('public.gda_opportunity_tracker');")
if [ -z "$OPP_EXISTS" ] || [ "$OPP_EXISTS" = "" ]; then
  log "HALT: gda_opportunity_tracker missing on target — FK for gda_decision_memory will fail"
  exit 1
fi
log "  gda_opportunity_tracker present on target — OK"

# 0d. FK orphan check (Q1 belt-and-suspenders)
log ""
log "── 0d. FK orphan check (gda_decision_memory.opportunity_id) ──"
ORPHAN_COUNT=$(src_sql "SELECT COUNT(*) FROM gda_decision_memory dm WHERE dm.opportunity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gda_opportunity_tracker ot WHERE ot.id = dm.opportunity_id);")
log "  Orphaned opportunity_id values: $ORPHAN_COUNT"
if [ "$ORPHAN_COUNT" != "0" ]; then
  log "HALT: $ORPHAN_COUNT orphaned opportunity_id values — FK import will fail"
  exit 1
fi

log ""
log "Pre-flight PASSED"

# ─── PHASE 1: WRITER PAUSE ────────────────────────────────────────────────────

log ""
log "══ PHASE 1: WRITER PAUSE ══"

PAUSE_TS=$(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')
log "Pause start: $PAUSE_TS"

CANARY_ID="LPUSYd4Vpph1Qg7n"
CHANGE_DETECTOR_ID="Zb2quk78c5mszZ2C"
CREDENTIAL_ID="HwronxMmGY5XDGEt"

if [ "$TARGET" = "prod" ]; then
  N8N_DB_CONTAINER="n8n-envision-postgres-1"
  N8N_DB_NAME="n8n"
  N8N_DB_USER_NAME="n8n"
  N8N_CONTAINER="n8n-envision-n8n-1"

  WRITER_IDS=$(docker exec "$N8N_DB_CONTAINER" psql -U "$N8N_DB_USER_NAME" -d "$N8N_DB_NAME" -tAc "
    SELECT id FROM workflow_entity
    WHERE active=true
      AND nodes::text LIKE '%${CREDENTIAL_ID}%'
      AND id != '$CANARY_ID'
    ORDER BY id;
  " 2>/dev/null)

  PAUSED=0
  PAUSE_FAILED=0
  for WF_ID in $WRITER_IDS; do
    WF_ID=$(echo "$WF_ID" | tr -d '[:space:]')
    [ -z "$WF_ID" ] && continue
    if n8n_api "POST" "/workflows/$WF_ID/deactivate" > /dev/null 2>&1; then
      PAUSED=$((PAUSED + 1))
    else
      log "WARNING: Failed to pause workflow $WF_ID"
      PAUSE_FAILED=$((PAUSE_FAILED + 1))
    fi
  done
  log "Paused: $PAUSED workflows (failed: $PAUSE_FAILED)"

  # Also pause change-detector
  if n8n_api "POST" "/workflows/$CHANGE_DETECTOR_ID/deactivate" > /dev/null 2>&1; then
    log "Change-detector $CHANGE_DETECTOR_ID paused"
  else
    log "WARNING: Failed to pause change-detector $CHANGE_DETECTOR_ID"
  fi
else
  log "Staging: skip workflow pause (no live workflows)"
fi

log "Canary $CANARY_ID: NOT paused (active)"

# 10-second quiesce window
log "Quiesce window: 10 seconds..."
sleep 10
log "Quiesce complete"

# ─── PHASE 2: DATA MIGRATION ──────────────────────────────────────────────────

log ""
log "══ PHASE 2: DATA MIGRATION ══"

COPIED=0
SKIPPED=0
FAILED=0
FAILURES=()

for TABLE in "${TABLES[@]}"; do
  log ""
  log "── Table: $TABLE ──"

  SRC_COUNT=$(src_sql "SELECT count(*) FROM $TABLE;")
  log "  Source count: $SRC_COUNT"

  TGT_COUNT=$(tgt_sql "SELECT count(*) FROM $TABLE;")
  log "  Target count: $TGT_COUNT"

  # 3-way idempotency
  if [ "$TGT_COUNT" = "$SRC_COUNT" ] && [ "$TGT_COUNT" != "0" ]; then
    log "  Decision: SKIP (target count $TGT_COUNT == source count $SRC_COUNT)"
    SKIPPED=$((SKIPPED + 1))
    continue
  elif [ "$TGT_COUNT" = "0" ] && [ "$SRC_COUNT" = "0" ]; then
    log "  Decision: SKIP (both source and target empty)"
    SKIPPED=$((SKIPPED + 1))
    continue
  elif [ "$TGT_COUNT" = "0" ]; then
    log "  Decision: COPY (target is empty, source has $SRC_COUNT rows)"
  else
    log "  HALT: target has $TGT_COUNT rows but source has $SRC_COUNT — partial migration detected"
    log "  Manual investigation required. Do NOT continue."
    exit 1
  fi

  # pg_dump from source (data-only, custom format)
  log "  Dumping from $SRC_CONTAINER..."
  if ! docker exec "$SRC_CONTAINER" pg_dump -U "$SRC_USER" -d "$SRC_DB" \
    --table="$TABLE" --data-only --no-owner --no-privileges --format=custom \
    -f "/tmp/${TABLE}.dump" 2>>"$LOGFILE"; then
    log "  FAIL: pg_dump failed for $TABLE"
    FAILED=$((FAILED + 1))
    FAILURES+=("$TABLE:pg_dump")
    docker exec "$SRC_CONTAINER" rm -f "/tmp/${TABLE}.dump" 2>/dev/null || true
    continue
  fi

  DUMP_SIZE=$(docker exec "$SRC_CONTAINER" stat -c%s "/tmp/${TABLE}.dump" 2>/dev/null || echo "unknown")
  log "  Dump size: $DUMP_SIZE bytes"

  # Copy dump file: source container → host → target container
  docker cp "$SRC_CONTAINER:/tmp/${TABLE}.dump" "$DUMP_DIR/${TABLE}.dump" 2>>"$LOGFILE"
  docker cp "$DUMP_DIR/${TABLE}.dump" "$TGT_CONTAINER:/tmp/${TABLE}.dump" 2>>"$LOGFILE"

  # pg_restore to target (data-only, single-transaction)
  # Filter out SEQUENCE SET entries from TOC — we do our own sequence sync
  log "  Restoring to $TGT_CONTAINER..."
  docker exec "$TGT_CONTAINER" pg_restore --list "/tmp/${TABLE}.dump" \
    | { grep -v 'SEQUENCE SET' || true; } > "$DUMP_DIR/${TABLE}.toc" 2>>"$LOGFILE"
  docker cp "$DUMP_DIR/${TABLE}.toc" "$TGT_CONTAINER:/tmp/${TABLE}.toc" 2>>"$LOGFILE"

  if ! docker exec "$TGT_CONTAINER" pg_restore -U "$TGT_USER" -d "$TGT_DB" \
    --data-only --no-owner --no-privileges --single-transaction \
    --use-list="/tmp/${TABLE}.toc" \
    "/tmp/${TABLE}.dump" 2>>"$LOGFILE"; then
    log "  FAIL: pg_restore failed for $TABLE (rolled back via --single-transaction)"
    FAILED=$((FAILED + 1))
    FAILURES+=("$TABLE:pg_restore")
    docker exec "$SRC_CONTAINER" rm -f "/tmp/${TABLE}.dump" 2>/dev/null || true
    docker exec "$TGT_CONTAINER" rm -f "/tmp/${TABLE}.dump" "/tmp/${TABLE}.toc" 2>/dev/null || true
    rm -f "$DUMP_DIR/${TABLE}.dump" "$DUMP_DIR/${TABLE}.toc" 2>/dev/null || true
    continue
  fi

  # Sequence sync (COALESCE(MAX(id), 1) per PLAN.md Section 6)
  log "  Syncing sequence for $TABLE..."
  tgt_sql "SELECT setval(pg_get_serial_sequence('${TABLE}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${TABLE}), 1), 1), (SELECT MAX(id) FROM ${TABLE}) IS NOT NULL AND (SELECT MAX(id) FROM ${TABLE}) >= 1);"
  SEQ_VAL=$(tgt_sql "SELECT last_value FROM $(tgt_sql "SELECT pg_get_serial_sequence('${TABLE}', 'id');");")
  log "  Sequence synced to: $SEQ_VAL"

  # Row-count verification
  VERIFY_COUNT=$(tgt_sql "SELECT count(*) FROM $TABLE;")
  log "  Verify target count: $VERIFY_COUNT"

  if [ "$VERIFY_COUNT" != "$SRC_COUNT" ]; then
    log "  FAIL: Row count mismatch — source=$SRC_COUNT target=$VERIFY_COUNT"
    FAILED=$((FAILED + 1))
    FAILURES+=("$TABLE:count_mismatch")
  else
    log "  PASS: $TABLE — $SRC_COUNT rows copied and verified"
    COPIED=$((COPIED + 1))
  fi

  # Clean up temp files
  docker exec "$SRC_CONTAINER" rm -f "/tmp/${TABLE}.dump" 2>/dev/null || true
  docker exec "$TGT_CONTAINER" rm -f "/tmp/${TABLE}.dump" "/tmp/${TABLE}.toc" 2>/dev/null || true
  rm -f "$DUMP_DIR/${TABLE}.dump" "$DUMP_DIR/${TABLE}.toc" 2>/dev/null || true
done

# ─── PHASE 3: POST-MIGRATION VALIDATION ───────────────────────────────────────

log ""
log "══ PHASE 3: POST-MIGRATION VALIDATION ══"

# 3a. FK validation on gda_decision_memory
log ""
log "── 3a. FK validation (gda_decision_memory.opportunity_id) ──"
FK_ORPHANS=$(tgt_sql "SELECT COUNT(*) FROM gda_decision_memory dm WHERE dm.opportunity_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM gda_opportunity_tracker ot WHERE ot.id = dm.opportunity_id);")
if [ "$FK_ORPHANS" = "0" ]; then
  log "  PASS: 0 orphaned FK values"
else
  log "  FAIL: $FK_ORPHANS orphaned FK values on target"
  FAILED=$((FAILED + 1))
  FAILURES+=("gda_decision_memory:fk_orphan")
fi

# 3b. UNIQUE constraint validation
log ""
log "── 3b. UNIQUE constraint validation (2 tables) ──"
UNIQUE_FAIL=0

check_unique() {
  local table=$1
  local cols=$2
  local constraint_name=$3
  local dup_count
  dup_count=$(tgt_sql "SELECT COUNT(*) FROM (SELECT $cols, COUNT(*) FROM $table GROUP BY $cols HAVING COUNT(*) > 1) sub;")
  if [ "$dup_count" = "0" ]; then
    log "  PASS: $constraint_name on $table — 0 duplicates"
  else
    log "  FAIL: $constraint_name on $table — $dup_count duplicate groups"
    UNIQUE_FAIL=$((UNIQUE_FAIL + 1))
  fi
}

check_unique "gda_content_store" "content_hash" "gda_content_store_content_hash_key"
check_unique "gda_data_lake" "source, source_id, record_type" "gda_data_lake_source_source_id_record_type_key"

if [ "$UNIQUE_FAIL" -gt 0 ]; then
  log "  HALT: $UNIQUE_FAIL UNIQUE constraint violation(s) detected"
  FAILED=$((FAILED + UNIQUE_FAIL))
  FAILURES+=("UNIQUE_CONSTRAINT:$UNIQUE_FAIL violations")
fi

# 3c. Sequence sync verification
log ""
log "── 3c. Sequence sync verification (6 tables) ──"
SEQ_FAIL=0

for TABLE in "${TABLES[@]}"; do
  SEQ_CHECK=$(tgt_sql "SELECT CASE WHEN last_value >= COALESCE((SELECT MAX(id) FROM ${TABLE}), 0) THEN 'PASS' ELSE 'FAIL' END FROM $(tgt_sql "SELECT pg_get_serial_sequence('${TABLE}', 'id');");")
  if [ "$SEQ_CHECK" = "PASS" ]; then
    SEQ_LAST=$(tgt_sql "SELECT last_value FROM $(tgt_sql "SELECT pg_get_serial_sequence('${TABLE}', 'id');");")
    MAX_ID=$(tgt_sql "SELECT COALESCE(MAX(id), 0) FROM ${TABLE};")
    log "  PASS: $TABLE sequence=$SEQ_LAST MAX(id)=$MAX_ID"
  else
    log "  FAIL: $TABLE sequence < MAX(id)"
    SEQ_FAIL=$((SEQ_FAIL + 1))
  fi
done

if [ "$SEQ_FAIL" -gt 0 ]; then
  log "  HALT: $SEQ_FAIL sequence sync failure(s)"
  FAILED=$((FAILED + SEQ_FAIL))
  FAILURES+=("SEQUENCE_SYNC:$SEQ_FAIL failures")
fi

# ─── PHASE 4: WRITER UNPAUSE ──────────────────────────────────────────────────

log ""
log "══ PHASE 4: WRITER UNPAUSE ══"

UNPAUSE_TS=$(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')
log "Unpause start: $UNPAUSE_TS"

if [ "$TARGET" = "prod" ]; then
  RESUMED=0
  for WF_ID in $WRITER_IDS; do
    WF_ID=$(echo "$WF_ID" | tr -d '[:space:]')
    [ -z "$WF_ID" ] && continue
    if n8n_api "POST" "/workflows/$WF_ID/activate" > /dev/null 2>&1; then
      RESUMED=$((RESUMED + 1))
    else
      log "WARNING: Failed to resume workflow $WF_ID"
    fi
  done
  log "Resumed: $RESUMED workflows"

  # Re-activate change-detector
  if n8n_api "POST" "/workflows/$CHANGE_DETECTOR_ID/activate" > /dev/null 2>&1; then
    log "Change-detector $CHANGE_DETECTOR_ID resumed"
  else
    log "WARNING: Failed to resume change-detector $CHANGE_DETECTOR_ID"
  fi
else
  log "Staging: skip workflow unpause (no live workflows)"
fi

UNPAUSE_END=$(TZ=America/New_York date '+%Y-%m-%d %H:%M:%S %Z')
log "Unpause complete: $UNPAUSE_END"

# ─── Clean up dump directory ──────────────────────────────────────────────────

rmdir "$DUMP_DIR" 2>/dev/null || true

# ─── SUMMARY ──────────────────────────────────────────────────────────────────

log ""
log "═══════════════════════════════════════════════════════════════"
log "SUMMARY"
log "  Total tables: ${#TABLES[@]}"
log "  Copied:  $COPIED"
log "  Skipped: $SKIPPED"
log "  Failed:  $FAILED"
log "  UNIQUE checks: $((2 - UNIQUE_FAIL))/2 passed"
log "  FK check: $( [ "$FK_ORPHANS" = "0" ] && echo "PASS" || echo "FAIL" )"
log "  Sequence sync: $((6 - SEQ_FAIL))/6 passed"
log "  Pause window: $PAUSE_TS → $UNPAUSE_END"
if [ ${#FAILURES[@]} -gt 0 ]; then
  log "  Failures: ${FAILURES[*]}"
fi
log "═══════════════════════════════════════════════════════════════"

if [ "$FAILED" -gt 0 ]; then
  log "EXIT: Non-zero — $FAILED failure(s)"
  exit 1
fi

log "EXIT: Success"
exit 0
