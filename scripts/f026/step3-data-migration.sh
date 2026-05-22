#!/usr/bin/env bash
set -euo pipefail

# F-026 Step 3 — Data Migration: n8n DB → gda_command
# Per approved plan: docs/runbooks/f026-step3-plan.md (PR #294)
#
# Design decisions implemented:
#   1. --target flag required (staging|prod), no default
#   2. 3-way idempotency: copy if target==0, skip if target==source, HALT otherwise
#   3. Transactional per-table (pg_restore --single-transaction)
#   4. FK-ordered (parents before children)
#   5. pgvector-aware (extension + dimension check before gda_embeddings)
#   6. Sequence sync (3-arg setval after each table)
#   7. Verbose logging with ISO timestamps
#   8. Configurable containers (staging vs prod)

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
else
  SRC_CONTAINER="n8n-envision-postgres-1"
  SRC_DB="n8n"
  SRC_USER="n8n"
  TGT_CONTAINER="gda-postgres"
  TGT_DB="gda_command"
  TGT_USER="gda"
fi

# ─── Logging ───────────────────────────────────────────────────────────────────

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
LOGFILE="/var/log/f026-step3-migration-${TARGET}-${TIMESTAMP}.log"
DUMP_DIR="/tmp/step3-dumps-${TIMESTAMP}"
mkdir -p "$DUMP_DIR"

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1"
  echo "$msg" | tee -a "$LOGFILE"
}

log "═══════════════════════════════════════════════════════════════"
log "F-026 Step 3 — Data Migration (target=$TARGET)"
log "Source: $SRC_CONTAINER / $SRC_DB (user: $SRC_USER)"
log "Target: $TGT_CONTAINER / $TGT_DB (user: $TGT_USER)"
log "Log: $LOGFILE"
log "Dump dir: $DUMP_DIR"
log "═══════════════════════════════════════════════════════════════"

# ─── FK-ordered table list (Section 5, decision #4) ───────────────────────────

# Phase 1: FK parents
# Phase 2: FK children
# Phase 3: Independent tables
TABLES=(
  # Phase 1: FK parents
  gda_relationships
  ft_signal_source
  # Phase 2: FK children
  gda_touchpoints
  ft_opportunity_signal
  # Phase 3: Independent
  gda_risk_register
  gda_opportunity_tracker
  gda_capture_plans
  gda_intelligence_log
  gda_competitor_watchlist
  opportunity_alerts
  gda_competitor_cache
  gda_action_items
  gda_active_contracts
  gda_dashboard_intel_cache
  daily_trends
  gda_opportunity_alerts
  gda_morning_briefings
  gda_learned_weights
  gda_win_loss
  gda_error_log
  gda_saved_opportunities
  gda_teaming_partners
  gda_embeddings
  govtribe_cache
  gda_wargames
  gda_win_loss_db
  gda_trend_arrays
  gda_contacts
)

# Tables without SERIAL PK (use natural key)
NO_SEQUENCE_TABLES="gda_trend_arrays"

# ─── Helper: run SQL on source ─────────────────────────────────────────────────

src_sql() {
  docker exec "$SRC_CONTAINER" psql -U "$SRC_USER" -d "$SRC_DB" -t -c "$1" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# ─── Helper: run SQL on target ─────────────────────────────────────────────────

tgt_sql() {
  docker exec "$TGT_CONTAINER" psql -U "$TGT_USER" -d "$TGT_DB" -t -c "$1" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# ─── Pre-flight: pgvector check (Section 5, decision #5) ──────────────────────

log ""
log "── Pre-flight: pgvector extension check ──"
PGVECTOR_VER=$(tgt_sql "SELECT extversion FROM pg_extension WHERE extname='vector';")
if [ -z "$PGVECTOR_VER" ]; then
  log "HALT: pgvector extension not installed on $TGT_CONTAINER/$TGT_DB"
  exit 1
fi
log "pgvector version: $PGVECTOR_VER"

# Check embedding column on source
SRC_EMB_TYPE=$(src_sql "SELECT udt_name FROM information_schema.columns WHERE table_name='gda_embeddings' AND column_name='embedding';")
# Check embedding column on target
TGT_EMB_TYPE=$(tgt_sql "SELECT udt_name FROM information_schema.columns WHERE table_name='gda_embeddings' AND column_name='embedding';")

log "Source gda_embeddings.embedding type: $SRC_EMB_TYPE"
log "Target gda_embeddings.embedding type: $TGT_EMB_TYPE"

if [ "$SRC_EMB_TYPE" != "$TGT_EMB_TYPE" ]; then
  log "HALT: Embedding column type mismatch — source=$SRC_EMB_TYPE target=$TGT_EMB_TYPE"
  exit 1
fi

# Verify dimension match (both should be vector(1536))
SRC_DIM=$(src_sql "SELECT atttypmod FROM pg_attribute WHERE attrelid = 'gda_embeddings'::regclass AND attname = 'embedding';")
TGT_DIM=$(tgt_sql "SELECT atttypmod FROM pg_attribute WHERE attrelid = 'gda_embeddings'::regclass AND attname = 'embedding';")
log "Source vector dimension (atttypmod): $SRC_DIM"
log "Target vector dimension (atttypmod): $TGT_DIM"

if [ "$SRC_DIM" != "$TGT_DIM" ]; then
  log "HALT: Vector dimension mismatch — source=$SRC_DIM target=$TGT_DIM"
  exit 1
fi

log "pgvector pre-flight PASSED"

# ─── Migration loop ───────────────────────────────────────────────────────────

COPIED=0
SKIPPED=0
FAILED=0
FAILURES=()

log ""
log "── Starting migration: ${#TABLES[@]} tables ──"

for TABLE in "${TABLES[@]}"; do
  log ""
  log "── Table: $TABLE ──"

  # Get source count
  SRC_COUNT=$(src_sql "SELECT count(*) FROM $TABLE;")
  log "  Source count: $SRC_COUNT"

  # Get target count
  TGT_COUNT=$(tgt_sql "SELECT count(*) FROM $TABLE;")
  log "  Target count: $TGT_COUNT"

  # 3-way idempotency decision tree (Section 5, decision #2)
  # Check SKIP first: handles both populated tables (N==N) and empty tables (0==0).
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
    # Clean up
    docker exec "$SRC_CONTAINER" rm -f "/tmp/${TABLE}.dump" 2>/dev/null || true
    continue
  fi

  DUMP_SIZE=$(docker exec "$SRC_CONTAINER" stat -c%s "/tmp/${TABLE}.dump" 2>/dev/null || echo "unknown")
  log "  Dump size: $DUMP_SIZE bytes"

  # Copy dump file: source container → host → target container
  docker cp "$SRC_CONTAINER:/tmp/${TABLE}.dump" "$DUMP_DIR/${TABLE}.dump" 2>>"$LOGFILE"
  docker cp "$DUMP_DIR/${TABLE}.dump" "$TGT_CONTAINER:/tmp/${TABLE}.dump" 2>>"$LOGFILE"

  # pg_restore to target (data-only, single-transaction)
  # Filter out SEQUENCE SET entries from the TOC — we do our own sequence sync
  # after each table (Section 5, decision #6). This prevents failures when
  # source sequence names don't match target (e.g. gda_risk_register was renamed
  # in F-023b but retained old sequence name risk_register_id_seq on source).
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
    # Clean up temp files
    docker exec "$SRC_CONTAINER" rm -f "/tmp/${TABLE}.dump" 2>/dev/null || true
    docker exec "$TGT_CONTAINER" rm -f "/tmp/${TABLE}.dump" "/tmp/${TABLE}.toc" 2>/dev/null || true
    rm -f "$DUMP_DIR/${TABLE}.dump" "$DUMP_DIR/${TABLE}.toc" 2>/dev/null || true
    continue
  fi

  # Sequence sync (Section 5, decision #6)
  if [[ ! " $NO_SEQUENCE_TABLES " =~ " $TABLE " ]]; then
    log "  Syncing sequence for $TABLE..."
    # GREATEST ensures we never pass 0 to setval (sequences have minvalue=1).
    # Handles: empty table (MAX=NULL→1,false), id=0 row (MAX=0→1,false), normal (MAX=N→N,true).
    tgt_sql "SELECT setval(pg_get_serial_sequence('${TABLE}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${TABLE}), 1), 1), (SELECT MAX(id) FROM ${TABLE}) IS NOT NULL AND (SELECT MAX(id) FROM ${TABLE}) >= 1);"
    SEQ_VAL=$(tgt_sql "SELECT last_value FROM $(tgt_sql "SELECT pg_get_serial_sequence('${TABLE}', 'id');");")
    log "  Sequence synced to: $SEQ_VAL"
  else
    log "  Skipping sequence sync ($TABLE uses natural key)"
  fi

  # Row-count verification (Section 6)
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

  # Timestamp verification for tables with updated_at or created_at
  HAS_UPDATED_AT=$(tgt_sql "SELECT count(*) FROM information_schema.columns WHERE table_name='${TABLE}' AND column_name='updated_at';")
  if [ "$HAS_UPDATED_AT" = "1" ]; then
    SRC_MAX_TS=$(src_sql "SELECT MAX(updated_at) FROM $TABLE;")
    TGT_MAX_TS=$(tgt_sql "SELECT MAX(updated_at) FROM $TABLE;")
    if [ "$SRC_MAX_TS" = "$TGT_MAX_TS" ]; then
      log "  Timestamp check: MAX(updated_at) match ($SRC_MAX_TS)"
    else
      log "  WARNING: MAX(updated_at) mismatch — source=$SRC_MAX_TS target=$TGT_MAX_TS"
    fi
  else
    HAS_CREATED_AT=$(tgt_sql "SELECT count(*) FROM information_schema.columns WHERE table_name='${TABLE}' AND column_name='created_at';")
    if [ "$HAS_CREATED_AT" = "1" ]; then
      SRC_MAX_TS=$(src_sql "SELECT MAX(created_at) FROM $TABLE;")
      TGT_MAX_TS=$(tgt_sql "SELECT MAX(created_at) FROM $TABLE;")
      if [ "$SRC_MAX_TS" = "$TGT_MAX_TS" ]; then
        log "  Timestamp check: MAX(created_at) match ($SRC_MAX_TS)"
      else
        log "  WARNING: MAX(created_at) mismatch — source=$SRC_MAX_TS target=$TGT_MAX_TS"
      fi
    fi
  fi

  # Clean up temp files
  docker exec "$SRC_CONTAINER" rm -f "/tmp/${TABLE}.dump" 2>/dev/null || true
  docker exec "$TGT_CONTAINER" rm -f "/tmp/${TABLE}.dump" "/tmp/${TABLE}.toc" 2>/dev/null || true
  rm -f "$DUMP_DIR/${TABLE}.dump" "$DUMP_DIR/${TABLE}.toc" 2>/dev/null || true
done

# ─── Clean up dump directory ──────────────────────────────────────────────────

rmdir "$DUMP_DIR" 2>/dev/null || true

# ─── Summary ──────────────────────────────────────────────────────────────────

log ""
log "═══════════════════════════════════════════════════════════════"
log "SUMMARY"
log "  Total tables: ${#TABLES[@]}"
log "  Copied:  $COPIED"
log "  Skipped: $SKIPPED"
log "  Failed:  $FAILED"
if [ ${#FAILURES[@]} -gt 0 ]; then
  log "  Failures: ${FAILURES[*]}"
fi
log "═══════════════════════════════════════════════════════════════"

if [ "$FAILED" -gt 0 ]; then
  log "EXIT: Non-zero — $FAILED table(s) failed"
  exit 1
fi

log "EXIT: Success"
exit 0
