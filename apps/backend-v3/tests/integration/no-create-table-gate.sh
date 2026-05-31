#!/usr/bin/env bash
# F-232 gate: no CREATE TABLE in integration test files.
# Real migrations are the only schema source.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
VIOLATIONS=$(grep -rn 'CREATE TABLE' "$DIR"/*.test.ts --include='*.test.ts' \
  | grep -v '^\s*//' \
  | grep -v '^\s*\*' \
  | grep -v 'No CREATE TABLE' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ CREATE TABLE found in integration test files:"
  echo "$VIOLATIONS"
  echo ""
  echo "Tests must use the real migration runner (globalSetup → migrate.ts)."
  echo "Use TRUNCATE or DELETE to reset state, not CREATE TABLE."
  exit 1
fi

echo "✓ No CREATE TABLE in integration tests."
