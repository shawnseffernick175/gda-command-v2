#!/usr/bin/env bash
# check-migration-idempotency.sh
# Ensures migrations >= v3_100 use IF NOT EXISTS on all CREATE INDEX statements.
# Exits non-zero listing offending files+lines if any are found.

set -euo pipefail

DIRS=(
  "apps/backend-v3/migrations"
  "db/v3/migrations"
)

MIN_VERSION=100
FAIL=0
OFFENDERS=""

for dir in "${DIRS[@]}"; do
  if [ ! -d "$dir" ]; then
    continue
  fi

  for file in "$dir"/v3_*.sql; do
    [ -f "$file" ] || continue

    # Extract numeric version from filename (e.g. v3_130_foo.sql -> 130)
    basename_file=$(basename "$file")
    version_num=$(echo "$basename_file" | sed -n 's/^v3_\([0-9]\+\)_.*/\1/p')

    # Skip if we can't parse or version < MIN_VERSION
    if [ -z "$version_num" ]; then
      continue
    fi
    # Remove leading zeros for numeric comparison
    version_num=$((10#$version_num))
    if [ "$version_num" -lt "$MIN_VERSION" ]; then
      continue
    fi

    # Check for CREATE INDEX (or CREATE UNIQUE INDEX) without IF NOT EXISTS
    # Match lines starting with CREATE [UNIQUE] INDEX that do NOT contain IF NOT EXISTS
    while IFS= read -r line; do
      if echo "$line" | grep -iqE '^\s*CREATE\s+(UNIQUE\s+)?INDEX' && \
         ! echo "$line" | grep -iq 'IF NOT EXISTS'; then
        OFFENDERS="${OFFENDERS}  ${file}: ${line}\n"
        FAIL=1
      fi
    done < "$file"
  done
done

if [ "$FAIL" -eq 1 ]; then
  echo "::error::CREATE INDEX without IF NOT EXISTS found in migrations >= v3_${MIN_VERSION}:"
  printf "%b" "$OFFENDERS"
  echo ""
  echo "All CREATE INDEX statements in migrations >= v3_${MIN_VERSION} must use IF NOT EXISTS."
  exit 1
fi

echo "Migration idempotency check passed — all CREATE INDEX in v3_${MIN_VERSION}+ use IF NOT EXISTS."
