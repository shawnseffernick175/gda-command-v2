#!/usr/bin/env bash
set -euo pipefail

# F-026 Step 3b — Data Migration: 30 N8N-ONLY tables n8n DB → gda_command
# Per approved plan: docs/runbooks/f026-step3b-plan.md (PR #299)
#
# Design decisions implemented:
#   1. --target flag required (staging|prod), no default
#   2. 3-way idempotency: copy if target==0 && source>0, skip if target==source,
#      skip if both==0, HALT if target!=0 && target!=source
#   3. Transactional per-table (pg_restore --single-transaction)
#   4. NO FK ordering (plan Section 2b: zero FK relationships)
#   5. NO pgvector check (plan Section 2c: none of the 30 tables use pgvector)
#   6. Sequence sync for 28 SERIAL tables (3-arg setval with GREATEST clamp)
#   7. Skip sequence sync for gda_approval_queue (UUID) and gda_mega_cache (manual int)
#   8. UNIQUE constraint post-check (8 tables per plan Section 6b)
#   9. CHECK constraint post-check (2 tables per plan Section 6c)
#  10. Verbose logging with ISO timestamps
#  11. SEQUENCE SET filter from pg_restore TOC (parity with Step 3)

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
LOGFILE="/var/log/f026-step3b-migration-${TARGET}-${TIMESTAMP}.log"
DUMP_DIR="/tmp/step3b-dumps-${TIMESTAMP}"
mkdir -p "$DUMP_DIR"

log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1"
  echo "$msg" | tee -a "$LOGFILE"
}

log "═══════════════════════════════════════════════════════════════"
log "F-026 Step 3b — Data Migration (target=$TARGET)"
log "Source: $SRC_CONTAINER / $SRC_DB (user: $SRC_USER)"
log "Target: $TGT_CONTAINER / $TGT_DB (user: $TGT_USER)"
log "Log: $LOGFILE"
log "Dump dir: $DUMP_DIR"
log "═══════════════════════════════════════════════════════════════"

# ─── Alphabetical table list (Section 4d, zero FK ordering needed) ─────────

TABLES=(
  gda_action_history
  gda_ai_feedback
  gda_aop_tracker
  gda_approval_queue
  gda_capture_lessons
  gda_chat_history
  gda_clause_library
  gda_competitor_crawls
  gda_compliance_matrices
  gda_contract_vehicles
  gda_daily_briefings
  gda_daily_briefs
  gda_deep_research
  gda_dept_market
  gda_discussions
  gda_doc_inbox
  gda_e2e_reports
  gda_feedback
  gda_health_scans
  gda_idiq_tracker
  gda_incumbent_analysis
  gda_knowledge_base
  gda_learning_log
  gda_meeting_notes
  gda_mega_cache
  gda_naics_tracking
  gda_ndaa_intel
  gda_ooda_loops
  gda_prompt_architect_memory
  gda_pwin_scores
)

# Tables without SERIAL PK — skip sequence sync
# gda_approval_queue: UUID PK with gen_random_uuid()
# gda_mega_cache: manual integer PK (no sequence, id=1 hardcoded by workflow)
NO_SEQUENCE_TABLES="gda_approval_queue gda_mega_cache"

# ─── Helper: run SQL on source ─────────────────────────────────────────────────

src_sql() {
  docker exec "$SRC_CONTAINER" psql -U "$SRC_USER" -d "$SRC_DB" -t -c "$1" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

# ─── Helper: run SQL on target ─────────────────────────────────────────────────

tgt_sql() {
  docker exec "$TGT_CONTAINER" psql -U "$TGT_USER" -d "$TGT_DB" -t -c "$1" 2>/dev/null | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

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

  # 3-way idempotency decision tree (plan Section 3a)
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
  # Filter out SEQUENCE SET entries from the TOC — we do our own sequence sync
  # after each table (plan Section 3c). Keeps parity with Step 3 script.
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

  # Sequence sync (plan Section 3c — 3-arg setval)
  if [[ ! " $NO_SEQUENCE_TABLES " =~ " $TABLE " ]]; then
    log "  Syncing sequence for $TABLE..."
    # GREATEST ensures we never pass 0 to setval (sequences have minvalue=1).
    # 3-arg form: is_called=true if data exists, false for empty (next INSERT gets 1 not 2).
    tgt_sql "SELECT setval(pg_get_serial_sequence('${TABLE}', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${TABLE}), 1), 1), (SELECT MAX(id) FROM ${TABLE}) IS NOT NULL AND (SELECT MAX(id) FROM ${TABLE}) >= 1);"
    SEQ_VAL=$(tgt_sql "SELECT last_value FROM $(tgt_sql "SELECT pg_get_serial_sequence('${TABLE}', 'id');");")
    log "  Sequence synced to: $SEQ_VAL"
  else
    log "  Skipping sequence sync ($TABLE uses non-SERIAL PK)"
  fi

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

# ─── Post-migration: UNIQUE constraint validation (plan Section 6b) ────────

log ""
log "── UNIQUE constraint validation (8 tables) ──"
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

check_unique "gda_aop_tracker" "ou, fiscal_year, quarter" "gda_aop_tracker_ou_fiscal_year_quarter_key"
check_unique "gda_clause_library" "clause_number" "gda_clause_library_clause_number_key"
check_unique "gda_contract_vehicles" "contract_number" "gda_contract_vehicles_contract_number_key"
check_unique "gda_dept_market" "dept" "gda_dept_market_dept_key"
check_unique "gda_idiq_tracker" "contract_number" "gda_idiq_tracker_contract_number_key"
check_unique "gda_incumbent_analysis" "agency, vendor_name" "gda_incumbent_analysis_agency_vendor_name_key"
check_unique "gda_naics_tracking" "company, month" "gda_naics_tracking_company_month_key"
check_unique "gda_ndaa_intel" "section, source_type" "gda_ndaa_intel_section_source_type_key"

if [ "$UNIQUE_FAIL" -gt 0 ]; then
  log "  HALT: $UNIQUE_FAIL UNIQUE constraint violation(s) detected"
  FAILED=$((FAILED + UNIQUE_FAIL))
  FAILURES+=("UNIQUE_CONSTRAINT:$UNIQUE_FAIL violations")
fi

# ─── Post-migration: CHECK constraint validation (plan Section 6c) ─────────

log ""
log "── CHECK constraint validation (2 tables, 5 checks) ──"
CHECK_FAIL=0

check_check() {
  local table=$1
  local col=$2
  local values=$3
  local constraint_name=$4
  local viol_count
  viol_count=$(tgt_sql "SELECT COUNT(*) FROM $table WHERE $col IS NOT NULL AND $col NOT IN ($values);")
  if [ "$viol_count" = "0" ]; then
    log "  PASS: $constraint_name — 0 violations"
  else
    log "  FAIL: $constraint_name — $viol_count violations"
    CHECK_FAIL=$((CHECK_FAIL + 1))
  fi
}

check_check "gda_ai_feedback" "user_action" "'accept','reject','modify','defer','flag'" "gda_ai_feedback_user_action_check"
check_check "gda_idiq_tracker" "gda_position" "'holder','teaming','targeting'" "gda_idiq_tracker_gda_position_check"
check_check "gda_idiq_tracker" "gda_prime_or_sub" "'prime','sub','either'" "gda_idiq_tracker_gda_prime_or_sub_check"
check_check "gda_idiq_tracker" "on_ramp_status" "'none','open','closed','upcoming'" "gda_idiq_tracker_on_ramp_status_check"
check_check "gda_idiq_tracker" "vehicle_type" "'IDIQ','BPA','GWAC','MAC','SA-IDIQ'" "gda_idiq_tracker_vehicle_type_check"

if [ "$CHECK_FAIL" -gt 0 ]; then
  log "  HALT: $CHECK_FAIL CHECK constraint violation(s) detected"
  FAILED=$((FAILED + CHECK_FAIL))
  FAILURES+=("CHECK_CONSTRAINT:$CHECK_FAIL violations")
fi

# ─── Post-migration: Sequence sync verification (plan Section 6d) ──────────

log ""
log "── Sequence sync verification (28 SERIAL tables) ──"
SEQ_FAIL=0

for TABLE in "${TABLES[@]}"; do
  if [[ " $NO_SEQUENCE_TABLES " =~ " $TABLE " ]]; then
    continue
  fi

  SEQ_CHECK=$(tgt_sql "SELECT CASE WHEN last_value >= COALESCE((SELECT MAX(id) FROM ${TABLE}), 0) THEN 'PASS' ELSE 'FAIL' END FROM $(tgt_sql "SELECT pg_get_serial_sequence('${TABLE}', 'id');");")
  if [ "$SEQ_CHECK" = "PASS" ]; then
    log "  PASS: $TABLE sequence >= MAX(id)"
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
log "  UNIQUE checks: $((8 - UNIQUE_FAIL))/8 passed"
log "  CHECK checks:  $((5 - CHECK_FAIL))/5 passed"
log "  Sequence sync: $((28 - SEQ_FAIL))/28 passed"
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
