#!/usr/bin/env bash
# F-234 gate: no CREATE TABLE in ANY test file.
# Real migrations are the only schema source.
# Scans all apps/backend-v3/tests/**/*.test.ts files.
set -euo pipefail

TESTS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIOLATIONS=$(grep -rn 'CREATE TABLE' "$TESTS_ROOT" --include='*.test.ts' \
  | grep -v '^\s*//' \
  | grep -v '^\s*\*' \
  | grep -v 'No CREATE TABLE' \
  || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ CREATE TABLE found in test files:"
  echo "$VIOLATIONS"
  echo ""
  echo "Tests must use the real migration runner (globalSetup → migrate.ts)."
  echo "Use TRUNCATE or DELETE to reset state, not CREATE TABLE."
  exit 1
fi

echo "✓ No CREATE TABLE in any test file."
