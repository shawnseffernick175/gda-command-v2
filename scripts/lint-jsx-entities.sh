#!/usr/bin/env bash
# lint-jsx-entities.sh — fail CI if any .tsx/.ts file in frontend-v3/src
# contains unescaped HTML named entities that JSX renders verbatim.
#
# JSX does NOT parse HTML entities like &check; or &mdash;.
# Use the literal UTF-8 character or a JS expression instead.

set -euo pipefail

TARGET="${1:-packages/frontend-v3/src}"

# Named entities that are commonly misused in JSX
PATTERN='&(amp|lt|gt|quot|apos|nbsp|copy|reg|trade|hellip|mdash|ndash|check|times|cross|star|rarr|larr|uarr|darr|ldquo|rdquo|lsquo|rsquo|bull|middot|para|sect|deg|plusmn|frac12|frac14|frac34|laquo|raquo);'

HITS=$(grep -rEn "$PATTERN" "$TARGET" --include='*.tsx' --include='*.ts' \
  | grep -v '\.test\.' \
  | grep -v '\.stories\.' \
  | grep -v '// allowed-entity' \
  || true)

if [ -n "$HITS" ]; then
  echo "::error::HTML named entities found in JSX source (they render verbatim — use UTF-8 chars instead):"
  echo "$HITS"
  exit 1
fi

echo "No HTML entity violations found."
