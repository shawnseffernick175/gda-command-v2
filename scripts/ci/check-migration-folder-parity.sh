#!/usr/bin/env bash
#
# CI guard: enforce PARITY between the two migration folders (ratcheting).
#
# WHY THIS EXISTS
# ---------------
# GDA Command has TWO migration runners, each reading a DIFFERENT folder:
#
#   1. apps/backend-v3/migrations/  — read by node-pg-migrate (ledger: pgmigrations)
#      Runs on EVERY container boot via apps/backend-v3/entrypoint.sh. Enforces
#      STRICT ordering (checkOrder): the (run_on,id)-ordered ledger names must
#      positionally match the name-sorted file list, or the backend crash-loops.
#
#   2. db/v3/migrations/            — read by db/v3/migrate.ts (ledger: v3_schema_migrations)
#      Run by scripts/deploy-prod.sh during deploy.
#
# A production-drift incident (June 2026) was traced to these folders diverging:
# PRs added migrations to only ONE folder, and historically the two folders even
# used different sequence numbers for the same logical migration. The deploy
# runner and the container runner then applied DIFFERENT sets of migrations,
# producing a schema no fresh container could reproduce — and, with a name
# collision, a boot crash-loop.
#
# RATCHET DESIGN
# --------------
# The historically-divergent files are recorded in
# scripts/ci/migration-parity-baseline.txt. This guard does NOT force a risky
# mass-renumber of that history. Instead it RATCHETS: it allows the baselined
# divergences but FAILS on any NEW divergence introduced by a PR.
#
# BASELINE HISTORY
# ----------------
#   - Originally 42 entries (June 2026 drift-incident remediation).
#   - Shrunk to 20 entries: 21 db/v3-only files that apply cleanly from scratch
#     AND leave the design-doc schema drift-free (verified against a node-postgres
#     replica of db/v3/migrate.ts on PG/pgvector, then re-checked with the real
#     scripts/v3-schema-diff.ts detector) were COPIED into db/v3 identically,
#     resolving them; the v3_099 comment-only header divergence was normalized
#     to the canonical filename.
#   - The remaining 20 are GENUINELY UNSAFE to merge and MUST stay baselined:
#       * 12 renumbered-twin files (v3_017..v3_023) — a logical migration exists
#         under a DIFFERENT sequence number in db/v3, so copying double-creates.
#       * v3_024_backfill_schema_migrations.sql — INSERTs into v3_schema_migrations,
#         dup-keys on a fresh-DB run.
#       * v3_028_field_override_audit.sql — FK REFERENCES unified_opportunities,
#         which intentionally does not persist in a db/v3 from-scratch run.
#       * v3_061_pipeline_stage_add_no_bid.sql — its CHECK constraint is violated
#         by seed rows present in the db/v3 from-scratch chain.
#       * v3_087_drop_grade_columns.sql — DROPs opportunities.grade /
#         grade_evidence + idx_opps_grade, which the architecture design doc
#         still defines; copying it makes the drift detector fail.
#       * 4 renumbered pairs: v3_093/094 opportunity_notes_owner and
#         v3_094/095 opportunity_value_date_enrichment.
#   - The baseline file is read with `sort -u` and is NOT comment-stripped, so it
#     MUST contain ONLY bare filenames. Keep all documentation in this header.
#   - Follow-up tracking: GitHub issue #898.
#
# When you add a migration:
#   - add an IDENTICAL .sql file to BOTH apps/backend-v3/migrations/
#     AND db/v3/migrations/ (same filename, same content).
#   - never reuse a sequence number that already exists in either folder.
#   - do NOT add new entries to the baseline file. New divergence is a bug.
#
set -euo pipefail
export LC_ALL=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APPS_DIR="$REPO_ROOT/apps/backend-v3/migrations"
DBV3_DIR="$REPO_ROOT/db/v3/migrations"
BASELINE="$REPO_ROOT/scripts/ci/migration-parity-baseline.txt"

fail=0
err() { echo "::error::$*"; fail=1; }

[ -d "$APPS_DIR" ] || { echo "::error::apps dir not found: $APPS_DIR"; exit 1; }
[ -d "$DBV3_DIR" ] || { echo "::error::db/v3 dir not found: $DBV3_DIR"; exit 1; }
[ -f "$BASELINE" ] || { echo "::error::baseline not found: $BASELINE"; exit 1; }

# db/v3 has a bootstrap file (v3_000_schema_migrations.sql) the apps runner does
# not use. Exclude it from comparison.
APPS="$(ls "$APPS_DIR"/v3_[0-9][0-9][0-9]_*.sql 2>/dev/null | xargs -n1 basename | sort)"
DBV3="$(ls "$DBV3_DIR"/v3_[0-9][0-9][0-9]_*.sql 2>/dev/null | grep -v '^v3_000_schema_migrations.sql$' | xargs -n1 basename | sort)"
ALLOWED="$(sort -u "$BASELINE")"

# --- Compute the CURRENT divergence set --------------------------------------
# 1) filename-set differences (symmetric difference)
NAME_DIFF="$(comm -3 <(printf '%s\n' "$APPS") <(printf '%s\n' "$DBV3") | tr -d '\t' | sort -u)"
# 2) content differences among shared filenames
COMMON="$(comm -12 <(printf '%s\n' "$APPS") <(printf '%s\n' "$DBV3"))"
CONTENT_DIFF=""
for f in $COMMON; do
  if ! diff -q "$APPS_DIR/$f" "$DBV3_DIR/$f" >/dev/null 2>&1; then
    CONTENT_DIFF="${CONTENT_DIFF}${f}\n"
  fi
done
CURRENT_DIVERGENCE="$(printf '%b%s\n' "$CONTENT_DIFF" "$NAME_DIFF" | grep -v '^$' | sort -u || true)"

# --- NEW divergence = current divergence not on the baseline -----------------
NEW_DIVERGENCE="$(comm -23 <(printf '%s\n' "$CURRENT_DIVERGENCE") <(printf '%s\n' "$ALLOWED") | grep -v '^$' || true)"
if [ -n "$NEW_DIVERGENCE" ]; then
  err "NEW migration-folder divergence introduced (not on baseline):"
  printf '  - %s\n' $NEW_DIVERGENCE
  echo "  Fix: add the IDENTICAL .sql file (same name + content) to BOTH"
  echo "       apps/backend-v3/migrations/ and db/v3/migrations/."
fi

# --- Also warn (not fail) if a baselined divergence was RESOLVED -------------
# Encourage shrinking the baseline over time.
RESOLVED="$(comm -23 <(printf '%s\n' "$ALLOWED") <(printf '%s\n' "$CURRENT_DIVERGENCE") | grep -v '^$' || true)"
if [ -n "$RESOLVED" ]; then
  echo "NOTE: these baselined divergences appear RESOLVED — remove them from"
  echo "      scripts/ci/migration-parity-baseline.txt to tighten the ratchet:"
  printf '  - %s\n' $RESOLVED
fi

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "::error::Migration FOLDER-PARITY guard FAILED (new divergence). See above."
  exit 1
fi
echo ""
echo "Migration folder-parity guard PASSED (no new divergence beyond baseline)."
