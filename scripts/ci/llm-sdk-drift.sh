#!/usr/bin/env bash
# F-215 D4 — Drift detector: forbid direct SDK imports outside src/lib/providers/
#
# Per D4 §15.3: Any new `import OpenAI` or `import Anthropic` outside
# `providers/` directory = CI red.
set -euo pipefail

BACKEND_SRC="apps/backend-v3/src"

PATTERNS=(
  "from ['\"]openai['\"]"
  "from ['\"]@anthropic-ai/sdk['\"]"
  "from ['\"]perplexity['\"]"
  "require(['\"]openai['\"])"
  "require(['\"]@anthropic-ai/sdk['\"])"
)

VIOLATIONS=0

for pattern in "${PATTERNS[@]}"; do
  MATCHES=$(grep -rn "$pattern" "$BACKEND_SRC" --include="*.ts" | grep -v "/providers/" || true)
  if [ -n "$MATCHES" ]; then
    echo "::error::Direct SDK import found outside providers/:"
    echo "$MATCHES"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "FAIL: Found $VIOLATIONS forbidden direct SDK import(s)."
  echo "All AI SDK imports must go through src/lib/providers/."
  echo "Use llmRouter.route() instead of direct SDK calls."
  exit 1
fi

echo "OK: No direct SDK imports outside providers/"
