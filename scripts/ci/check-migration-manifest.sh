#!/usr/bin/env bash
#
# CI guard: prevent migration-directory drift.
#
# WHY THIS EXISTS
# ---------------
# The Docker runtime applies migrations ONLY from apps/backend-v3/migrations/
# (see apps/backend-v3/src/lib/migrate.ts -> MIGRATIONS_DIR). node-pg-migrate
# keys on the migration NAME (filename minus .sql) and applies in sorted order.
#
# A drift incident occurred where files were applied on the live VPS runner dir
# but were never committed to apps/backend-v3/migrations/. A fresh container could
# not reproduce the live schema. PR #761 restored the 25 missing files.
#
# This guard makes that class of drift impossible to merge silently. It asserts:
#   1. The committed runner dir file set EXACTLY matches a committed manifest
#      (scripts/ci/migration-manifest.txt). Any added/removed file must update
#      the manifest in the same commit -- a deliberate, reviewable action.
#   2. No sequence-number GAPS in the runner dir prefixes.
#   3. Duplicate sequence-number prefixes are limited to a known allow-list.
#      New accidental duplicates are flagged.
#
# When you legitimately add a migration:
#   - add the .sql file to apps/backend-v3/migrations/
#   - run: ls apps/backend-v3/migrations/*.sql | xargs -n1 basename | sort \
#          > scripts/ci/migration-manifest.txt
#   - commit both. CI stays green.
#
set -euo pipefail
# Deterministic, locale-independent sort/comm behavior.
export LC_ALL=C

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNNER_DIR="$REPO_ROOT/apps/backend-v3/migrations"
MANIFEST="$REPO_ROOT/scripts/ci/migration-manifest.txt"

# Known, intentional duplicate sequence-number prefixes. These were merged
# historically and are part of the live ledger. Adding to this list is a
# deliberate, reviewable action.
ALLOWED_DUP_PREFIXES="v3_044 v3_046"

fail=0
err() { echo "::error::$*"; fail=1; }

# --- Preconditions -----------------------------------------------------------
if [ ! -d "$RUNNER_DIR" ]; then
  echo "::error::Runner migrations dir not found: $RUNNER_DIR"
  exit 1
fi
if [ ! -f "$MANIFEST" ]; then
  echo "::error::Migration manifest not found: $MANIFEST"
  echo "Generate it with: ls apps/backend-v3/migrations/*.sql | xargs -n1 basename | sort > scripts/ci/migration-manifest.txt"
  exit 1
fi

# --- 1. Runner dir file set must EXACTLY match the committed manifest ---------
ACTUAL="$(ls "$RUNNER_DIR"/*.sql 2>/dev/null | xargs -n1 basename | sort)"
EXPECTED="$(sort "$MANIFEST")"

MISSING="$(comm -23 <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL"))"
EXTRA="$(comm -13 <(printf '%s\n' "$EXPECTED") <(printf '%s\n' "$ACTUAL"))"

if [ -n "$MISSING" ]; then
  err "Migration files in manifest but MISSING from runner dir (drift!):"
  printf '  - %s\n' $MISSING
fi
if [ -n "$EXTRA" ]; then
  err "Migration files in runner dir but NOT in manifest (uncommitted/extra):"
  printf '  - %s\n' $EXTRA
  echo "  If these are intentional, regenerate the manifest and commit it:"
  echo "    ls apps/backend-v3/migrations/*.sql | xargs -n1 basename | sort > scripts/ci/migration-manifest.txt"
fi
if [ -z "$MISSING" ] && [ -z "$EXTRA" ]; then
  echo "OK: runner dir matches manifest ($(printf '%s\n' "$ACTUAL" | grep -c . ) files)."
fi

# --- 2. No sequence-number gaps ----------------------------------------------
# Extract numeric sequence from each filename (v3_NNN_*), unique-sorted.
SEQS="$(printf '%s\n' "$ACTUAL" | sed -E 's/^v3_0*([0-9]+)_.*/\1/' | sort -n | uniq)"
MIN_SEQ="$(printf '%s\n' "$SEQS" | head -1)"
MAX_SEQ="$(printf '%s\n' "$SEQS" | tail -1)"
# Walk the contiguous range and collect any sequence number with no file.
GAPS=""
for n in $(seq "$MIN_SEQ" "$MAX_SEQ"); do
  if ! printf '%s\n' "$SEQS" | grep -qx "$n"; then
    GAPS="$GAPS $n"
  fi
done
GAPS="$(echo "$GAPS" | xargs || true)"
if [ -n "$GAPS" ]; then
  err "Sequence-number GAPS in runner dir (missing prefixes between $MIN_SEQ and $MAX_SEQ):"
  printf '  - v3_%03d_*\n' $GAPS
else
  echo "OK: no sequence gaps (v3_$(printf '%03d' "$MIN_SEQ") .. v3_$(printf '%03d' "$MAX_SEQ"))."
fi

# --- 3. Duplicate sequence prefixes must be on the allow-list ----------------
DUP_PREFIXES="$(printf '%s\n' "$ACTUAL" | sed -E 's/^(v3_[0-9]+)_.*/\1/' | sort | uniq -d)"
for p in $DUP_PREFIXES; do
  allowed=0
  for a in $ALLOWED_DUP_PREFIXES; do
    [ "$p" = "$a" ] && allowed=1
  done
  if [ "$allowed" -eq 1 ]; then
    echo "OK: known duplicate prefix $p (allow-listed)."
  else
    err "Unexpected duplicate sequence prefix: ${p}_*"
    printf '  - %s\n' $(printf '%s\n' "$ACTUAL" | grep -E "^${p}_")
    echo "  Two migrations sharing a sequence number is fragile. Renumber, or add"
    echo "  '$p' to ALLOWED_DUP_PREFIXES in this script if intentional."
  fi
done

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "::error::Migration-dir guard FAILED. See messages above."
  exit 1
fi
echo ""
echo "Migration-dir guard PASSED."
