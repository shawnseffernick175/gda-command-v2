#!/usr/bin/env bash
#
# check-migration-parity.sh
#
# Guardrail against production migration drift (go-forward only).
#
# Background: production deploy runs ONLY db/v3/migrations/ (via db/v3/migrate.ts).
# Historically, PRs sometimes wrote new migration files into
# apps/backend-v3/migrations/ but not into db/v3/migrations/, so the deploy
# never ran them and the live schema silently fell behind main. This script
# fails CI when NEW migrations diverge so the gap is caught before merge.
#
# Baseline: migrations numbered <= GUARDRAIL_BASELINE are grandfathered
# (already applied to production, frozen, never re-run by the ledger). Only
# migrations numbered ABOVE the baseline are policed.
#
# Rules enforced (for migrations numbered > baseline):
#   1. Every such *.sql in apps/backend-v3/migrations/ must also exist (by
#      filename) in db/v3/migrations/ — db/v3 is the source of truth the
#      deploy executes.
#   2. When the same filename exists in both folders, the executable SQL must
#      match (comment-only differences are tolerated).
#   3. Must be idempotent: no bare "CREATE TABLE x" without "IF NOT EXISTS".
#      A bare CREATE on an already-applied table makes the migrator exit 1 and
#      rolls back the entire deploy.
#
# Exit non-zero on any violation.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/db/v3/migrations"
APPS_DIR="$REPO_ROOT/apps/backend-v3/migrations"

# Highest migration number already applied to production at the time this
# guardrail was introduced. Everything <= this is frozen history.
GUARDRAIL_BASELINE=87

fail=0

# Extract the leading numeric index from a v3_NNN_*.sql filename.
mig_num() {
  local b; b="$(basename "$1")"
  echo "$b" | sed -nE 's/^v3_0*([0-9]+)_.*/\1/p'
}

# Strip SQL comment lines and blank lines for a content comparison that
# ignores cosmetic header differences.
sql_body() {
  grep -vE '^[[:space:]]*--' "$1" | grep -vE '^[[:space:]]*$'
}

echo "== Migration drift guardrail (baseline > v3_$(printf '%03d' "$GUARDRAIL_BASELINE")) =="
echo "deploy (source of truth): $DEPLOY_DIR"
echo "apps:                     $APPS_DIR"
echo ""

# Rule 1 + 2: apps files (above baseline) must be present + body-identical in db/v3
if [ -d "$APPS_DIR" ]; then
  for src in "$APPS_DIR"/*.sql; do
    [ -e "$src" ] || continue
    base="$(basename "$src")"
    num="$(mig_num "$src")"
    [ -z "$num" ] && continue
    [ "$num" -le "$GUARDRAIL_BASELINE" ] && continue
    dst="$DEPLOY_DIR/$base"
    if [ ! -f "$dst" ]; then
      echo "::error::MISSING in db/v3/migrations: $base — exists in apps/backend-v3 but the deploy will never run it."
      fail=1
      continue
    fi
    if ! diff -q <(sql_body "$src") <(sql_body "$dst") >/dev/null; then
      echo "::error::SQL MISMATCH between folders for: $base — db/v3 (deployed) executable SQL differs from apps/backend-v3."
      fail=1
    fi
  done
fi

# Rule 3: idempotency for deployed migrations above baseline
for f in "$DEPLOY_DIR"/*.sql; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  [ "$base" = "v3_000_schema_migrations.sql" ] && continue
  num="$(mig_num "$f")"
  [ -z "$num" ] && continue
  [ "$num" -le "$GUARDRAIL_BASELINE" ] && continue
  bad_lines="$(grep -inE 'create[[:space:]]+table' "$f" | grep -ivE 'if[[:space:]]+not[[:space:]]+exists' || true)"
  if [ -n "$bad_lines" ]; then
    echo "::error::NON-IDEMPOTENT migration $base — 'CREATE TABLE' without 'IF NOT EXISTS'. A re-run will crash the deploy:"
    echo "$bad_lines" | sed 's/^/    /'
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Migration drift guardrail FAILED. Fix: copy missing files into db/v3/migrations/,"
  echo "make folder bodies match, and use 'CREATE TABLE IF NOT EXISTS' everywhere."
  exit 1
fi

echo "Migration drift guardrail PASSED — new migrations consistent and idempotent."
