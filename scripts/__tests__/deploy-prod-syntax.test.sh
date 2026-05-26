#!/usr/bin/env bash
# Syntax and lint checks for deploy-prod.sh and deploy-prod.yml.
# Run: bash scripts/__tests__/deploy-prod-syntax.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="${REPO_ROOT}/scripts/deploy-prod.sh"
WORKFLOW="${REPO_ROOT}/.github/workflows/deploy-prod.yml"
PASS=0
FAIL=0

run_check() {
  local name="$1"
  shift
  echo -n "  ${name} ... "
  if "$@" > /tmp/deploy-test-output.txt 2>&1; then
    echo "PASS"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    cat /tmp/deploy-test-output.txt
    FAIL=$((FAIL + 1))
  fi
}

echo "=== deploy-prod syntax tests ==="

# 1. bash -n (syntax check)
run_check "bash -n deploy-prod.sh" bash -n "$SCRIPT"

# 2. shellcheck
if command -v shellcheck > /dev/null 2>&1; then
  run_check "shellcheck deploy-prod.sh" shellcheck -e SC2086 "$SCRIPT"
else
  echo "  shellcheck deploy-prod.sh ... SKIP (shellcheck not installed)"
fi

# 3. actionlint
if command -v actionlint > /dev/null 2>&1; then
  run_check "actionlint deploy-prod.yml" actionlint "$WORKFLOW"
else
  echo "  actionlint deploy-prod.yml ... SKIP (actionlint not installed)"
fi

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
