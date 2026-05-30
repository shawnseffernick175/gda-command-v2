#!/usr/bin/env bash
# -----------------------------------------------------------
# R2 Forbidden-Token Scanner
#
# Enforces F-201 Addendum A.5: permanently banned tokens in
# the V3 API surface. Called by the v3-forbidden-tokens
# workflow and by the gate self-tests.
#
# Usage:
#   ./scripts/ci/forbidden-token-scan.sh [SCAN_PATH ...]
#
# If no paths are given, the default scan paths are used.
# Exit code 0 = clean, 1 = violation(s) found.
# -----------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# -----------------------------------------------------------
# Default scan paths (can be overridden by positional args)
# -----------------------------------------------------------
if [ $# -gt 0 ]; then
  SCAN_PATHS=("$@")
else
  SCAN_PATHS=(
    "apps/backend-v3/"
    "db/v3/migrations/"
    "docs/architecture/v3/openapi-v3.yaml"
  )
fi

# -----------------------------------------------------------
# Files allowed to mention forbidden tokens (doc/workflow)
# -----------------------------------------------------------
ALLOWED_FILES=(
  "docs/architecture/v3/phase-1-test-strategy.md"
  "docs/architecture/v3/phase-1-architecture-and-schema.md"
  "docs/architecture/v3/phase-1-api-contract.md"
  "docs/architecture/v3/openapi-v3.yaml"
  ".github/workflows/v3-forbidden-tokens.yml"
  "scripts/ci/forbidden-token-scan.sh"
)

# -----------------------------------------------------------
# Forbidden patterns (verbatim from F-201 Addendum A.5)
# -----------------------------------------------------------
PATTERNS=(
  'analysis_status'
  'stale:\s*true'
  'stale:\s*boolean'
  '"stale"'
  'analysis:\s*null'
  '"not_yet_analyzed"'
  '"running"'
  '"pending"'
)

# -----------------------------------------------------------
# Build an exclusion regex for allowed files
# -----------------------------------------------------------
ALLOWED_FILTER=""
for f in "${ALLOWED_FILES[@]}"; do
  escaped="$(echo "$f" | sed 's/[.[\\/]/\\&/g')"
  if [ -n "$ALLOWED_FILTER" ]; then
    ALLOWED_FILTER+="|"
  fi
  ALLOWED_FILTER+="$escaped"
done

# -----------------------------------------------------------
# is_test_file PATH
#
# Returns 0 (true) if the path is a test file that should be
# excluded from the scan.
# -----------------------------------------------------------
is_test_file() {
  local fpath="$1"
  # Match apps/backend-v3/tests/** (dedicated test directory)
  if [[ "$fpath" =~ ^apps/backend-v3/tests/ ]]; then
    return 0
  fi
  # Match apps/backend-v3/**/*.test.ts(x) and *.spec.ts(x)
  if [[ "$fpath" =~ ^apps/backend-v3/ ]]; then
    if [[ "$fpath" =~ \.test\.tsx?$ ]] || [[ "$fpath" =~ \.spec\.tsx?$ ]]; then
      return 0
    fi
  fi
  return 1
}

# -----------------------------------------------------------
# sanitize_yaml FILE
#
# Outputs the file with description-block lines and comment
# lines replaced by empty strings (line count preserved).
# This lets us grep the sanitized output and still get
# correct line numbers back.
# -----------------------------------------------------------
sanitize_yaml() {
  python3 - "$1" <<'PYEOF'
import sys

filepath = sys.argv[1]
with open(filepath, 'r') as f:
    lines = f.readlines()

# Track whether we are inside a multi-line description: block.
# When we encounter 'description: |' or 'description: >', the
# block continues until a line at equal or lesser indentation.
in_desc_block = False
desc_indent = 0

# Also handle single-line description: "..." values.
result = []

for i, line in enumerate(lines):
    stripped = line.lstrip()

    # YAML comment lines — always safe
    if stripped.startswith('#'):
        result.append('')
        continue

    # Empty/whitespace lines
    if not stripped:
        if in_desc_block:
            result.append('')
        else:
            result.append(line.rstrip('\n'))
        continue

    indent = len(line) - len(line.lstrip())

    # If we're in a multi-line description block, check if we've
    # left it (line at equal or lesser indentation)
    if in_desc_block:
        if indent <= desc_indent:
            in_desc_block = False
            # Fall through to process this line normally
        else:
            result.append('')
            continue

    # Check if this line starts a description field
    if ':' in stripped:
        key = stripped.split(':')[0].strip().strip('"').strip("'")
        if key == 'description':
            # Get the value part after the key
            colon_pos = stripped.index(':')
            value_part = stripped[colon_pos + 1:].strip()

            if value_part in ('|', '>', '|+', '|-', '>+', '>-'):
                # Multi-line block scalar — mark start
                in_desc_block = True
                desc_indent = indent
                result.append('')
                continue
            else:
                # Single-line description value — blank this line
                result.append('')
                continue

    # Not a description, not a comment — keep it
    result.append(line.rstrip('\n'))

for line in result:
    print(line)
PYEOF
}

# -----------------------------------------------------------
# Main scan loop
# -----------------------------------------------------------
FOUND=0

for pattern in "${PATTERNS[@]}"; do
  EXISTING_PATHS=()
  for p in "${SCAN_PATHS[@]}"; do
    target="$REPO_ROOT/$p"
    if [ -e "$target" ]; then
      EXISTING_PATHS+=("$target")
    fi
  done

  if [ ${#EXISTING_PATHS[@]} -eq 0 ]; then
    echo "No scan paths exist yet -- skipping pattern: $pattern"
    continue
  fi

  # Separate YAML and non-YAML paths
  YAML_PATHS=()
  OTHER_PATHS=()
  for ep in "${EXISTING_PATHS[@]}"; do
    if [[ "$ep" == *.yaml ]] || [[ "$ep" == *.yml ]]; then
      YAML_PATHS+=("$ep")
    elif [ -d "$ep" ]; then
      OTHER_PATHS+=("$ep")
      # Also collect YAML files inside directories
      while IFS= read -r yf; do
        YAML_PATHS+=("$yf")
      done < <(find "$ep" -path '*/node_modules' -prune -o -type f \( -name '*.yaml' -o -name '*.yml' \) -print 2>/dev/null)
    else
      OTHER_PATHS+=("$ep")
    fi
  done

  VIOLATIONS=""

  # ---------------------------------------------------------
  # Scan non-YAML files
  # ---------------------------------------------------------
  if [ ${#OTHER_PATHS[@]} -gt 0 ]; then
    MATCHES=$(grep -rHn --exclude='*.yaml' --exclude='*.yml' --exclude-dir=node_modules -E "$pattern" "${OTHER_PATHS[@]}" 2>/dev/null || true)
    if [ -n "$MATCHES" ]; then
      while IFS= read -r line; do
        rel="${line#"$REPO_ROOT/"}"
        filepath="${rel%%:*}"

        # Skip allowed documentation files
        if echo "$rel" | grep -qE "^($ALLOWED_FILTER):"; then
          continue
        fi

        # Skip test files
        if is_test_file "$filepath"; then
          continue
        fi

        # Skip FORBIDDEN magic-comment marker
        if echo "$rel" | grep -qE ':[0-9]+:\s*(//|#|/\*|\*|<!--).*FORBIDDEN'; then
          continue
        fi

        VIOLATIONS+="$rel"$'\n'
      done <<< "$MATCHES"
    fi
  fi

  # ---------------------------------------------------------
  # Scan YAML files (preprocessed to strip descriptions/comments)
  # ---------------------------------------------------------
  for yf in "${YAML_PATHS[@]}"; do
    rel_yf="${yf#"$REPO_ROOT/"}"

    # Skip if it's an allowed file
    if echo "$rel_yf" | grep -qE "^($ALLOWED_FILTER)$"; then
      continue
    fi

    # Skip test files (YAML files in tests/ dirs)
    if is_test_file "$rel_yf"; then
      continue
    fi

    # Sanitize and scan
    SANITIZED=$(sanitize_yaml "$yf")
    YAML_MATCHES=$(echo "$SANITIZED" | grep -n -E "$pattern" 2>/dev/null || true)
    if [ -n "$YAML_MATCHES" ]; then
      while IFS= read -r match; do
        VIOLATIONS+="$rel_yf:$match"$'\n'
      done <<< "$YAML_MATCHES"
    fi
  done

  # Trim trailing newline
  VIOLATIONS="${VIOLATIONS%$'\n'}"

  if [ -n "$VIOLATIONS" ]; then
    echo "::error::Forbidden token matched: $pattern"
    echo "$VIOLATIONS"
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo ""
  echo "=========================================="
  echo "FAILED: Forbidden R2 tokens detected."
  echo "These tokens are permanently banned from"
  echo "the V3 codebase per F-201 Addendum A.5."
  echo "=========================================="
  exit 1
fi

echo "PASSED: No forbidden R2 tokens found."
exit 0
