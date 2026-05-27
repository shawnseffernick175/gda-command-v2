#!/usr/bin/env bash
# rotate-gda-runtime-credential.sh — Rotate gda_runtime password + update DATABASE_URL.
# Run ON the VPS. Generates new password, updates Postgres + .env, restarts backend, verifies health.
#
# Shawn's only manual step: copy password from handoff file to:
#   1. n8n credential HwronxMmGY5XDGEt (GDA Postgres)
#   2. GitHub Actions secret (if applicable)
#
# Usage: bash scripts/rotate-gda-runtime-credential.sh [prod|staging] [--dry-run] [--force]
#
# Flags:
#   --dry-run   Print what would change without making changes
#   --force     Skip confirmation prompts
set -euo pipefail

# ── Parse arguments ────────────────────────────────────────────────────────
DRY_RUN=false
FORCE=false
ENV=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --force)   FORCE=true ;;
    prod|staging) ENV="$arg" ;;
    *)
      echo "Usage: $0 [prod|staging] [--dry-run] [--force]" >&2
      exit 1
      ;;
  esac
done
ENV="${ENV:-prod}"

# ── Environment config ─────────────────────────────────────────────────────
case "$ENV" in
  prod)
    PG_CONTAINER="gda-postgres"
    DB_USER="gda"
    DB_NAME="gda"
    RUNTIME_ROLE="gda_runtime"
    BACKEND_SERVICE="backend"
    BACKEND_CONTAINER="gda-backend"
    ENV_VAR_NAME="DATABASE_URL"
    DB_HOST="postgres"
    ;;
  staging)
    PG_CONTAINER="gda-postgres-staging"
    DB_USER="gda_staging"
    DB_NAME="gda_command_staging"
    RUNTIME_ROLE="gda_staging_rt"
    BACKEND_SERVICE=""
    BACKEND_CONTAINER=""
    ENV_VAR_NAME="STAGING_DATABASE_URL"
    DB_HOST="postgres-staging"
    ;;
  *)
    echo "Usage: $0 [prod|staging] [--dry-run] [--force]" >&2
    exit 1
    ;;
esac

DEPLOY_DIR="/root/gda-command-v2"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="${DEPLOY_DIR}/.env"
HANDOFF="/tmp/gda-runtime-pw-shawn-readonly"

echo "=== rotate-gda-runtime-credential.sh ==="
echo "env=${ENV}  role=${RUNTIME_ROLE}  dry_run=${DRY_RUN}  force=${FORCE}"

# ── Hard guard: staging must NOT touch prod DATABASE_URL ────────────────────
if [ "$ENV" = "staging" ]; then
  echo ""
  echo "NOTE: No staging backend service exists (postgres-staging is for CI"
  echo "migration testing only). This script will rotate the Postgres password"
  echo "and write the handoff file, but will NOT touch DATABASE_URL or restart"
  echo "any backend container."
  echo ""
fi

# ── Verify role exists ─────────────────────────────────────────────────────
if ! docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
    -c "SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}'" | grep -q '1'; then
  echo "ERROR: role ${RUNTIME_ROLE} does not exist. Run bootstrap-gda-runtime.sh first." >&2
  exit 1
fi
echo "--- role ${RUNTIME_ROLE} verified ---"

# ── Dry-run mode: show what would change and exit ──────────────────────────
if $DRY_RUN; then
  echo ""
  echo "=== DRY RUN — no changes will be made ==="
  echo ""
  echo "Would generate a 32-char password and:"
  echo "  1. ALTER ROLE ${RUNTIME_ROLE} PASSWORD '***' in ${PG_CONTAINER}"
  echo "  2. Write password to ${HANDOFF} (chmod 400)"
  if [ "$ENV" = "staging" ]; then
    echo "  3. Write ${ENV_VAR_NAME}=postgresql://${RUNTIME_ROLE}:***@${DB_HOST}:5432/${DB_NAME} to ${ENV_FILE}"
    echo "  4. (skip) No backend restart — staging has no backend service"
    echo "  5. (skip) No health check — staging has no backend service"
  else
    echo "  3. Update ${ENV_VAR_NAME}=postgresql://${RUNTIME_ROLE}:***@${DB_HOST}:5432/${DB_NAME} in ${ENV_FILE}"
    echo "  4. docker compose -f ${COMPOSE_FILE} up -d --build ${BACKEND_SERVICE}"
    echo "  5. Health check: /health then /api/sentinel/current"
  fi
  echo "  6. Verify runtime role authentication"
  echo ""
  echo "Current ${ENV_VAR_NAME} in .env:"
  grep "^${ENV_VAR_NAME}=" "$ENV_FILE" 2>/dev/null || echo "  (not set)"
  if [ "$ENV" = "prod" ]; then
    echo ""
    echo "Current DATABASE_URL in .env (will be REPLACED):"
    grep "^DATABASE_URL=" "$ENV_FILE" 2>/dev/null || echo "  (not set)"
  fi
  echo ""
  echo "=== DRY RUN complete ==="
  exit 0
fi

# ── Confirmation prompt (unless --force) ───────────────────────────────────
if ! $FORCE; then
  echo ""
  if [ "$ENV" = "prod" ]; then
    echo "WARNING: This will rotate the PRODUCTION runtime credential."
    echo "  - ALTER ROLE ${RUNTIME_ROLE} PASSWORD in ${PG_CONTAINER}"
    echo "  - Replace DATABASE_URL in ${ENV_FILE}"
    echo "  - Restart backend (service: ${BACKEND_SERVICE}, container: ${BACKEND_CONTAINER})"
  else
    echo "This will rotate the STAGING runtime credential."
    echo "  - ALTER ROLE ${RUNTIME_ROLE} PASSWORD in ${PG_CONTAINER}"
    echo "  - Write ${ENV_VAR_NAME} to ${ENV_FILE} (will NOT touch DATABASE_URL)"
    echo "  - No backend restart (staging has no backend service)"
  fi
  echo ""
  read -rp "Proceed? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# 1. Generate 32-char alphanumeric password
NEW_PW=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)
echo "--- generated 32-char password ---"

# 2. ALTER ROLE in Postgres
docker exec "$PG_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "ALTER ROLE ${RUNTIME_ROLE} PASSWORD '${NEW_PW}'"
echo "--- password updated in Postgres ---"

# 3. Write handoff file
echo -n "$NEW_PW" > "$HANDOFF"
chmod 400 "$HANDOFF"
echo "--- handoff file: ${HANDOFF} ---"

# 4. Update env var in .env
#    Password is alphanumeric-only so no URL-encoding needed, but encode for safety.
ENCODED_PW=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${NEW_PW}', safe=''))")
NEW_URL="postgresql://${RUNTIME_ROLE}:${ENCODED_PW}@${DB_HOST}:5432/${DB_NAME}"

if grep -q "^${ENV_VAR_NAME}=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^${ENV_VAR_NAME}=.*|${ENV_VAR_NAME}=${NEW_URL}|" "$ENV_FILE"
  echo "--- ${ENV_VAR_NAME} updated in .env ---"
else
  echo "${ENV_VAR_NAME}=${NEW_URL}" >> "$ENV_FILE"
  echo "--- ${ENV_VAR_NAME} added to .env ---"
fi

# ── Staging: exit early — no backend to restart ────────────────────────────
if [ "$ENV" = "staging" ]; then
  # Verify authentication
  echo "--- verifying runtime role authentication ---"
  if docker exec -e PGPASSWORD="$NEW_PW" "$PG_CONTAINER" \
      psql -U "$RUNTIME_ROLE" -d "$DB_NAME" -t -A -c "SELECT 'auth_ok'" 2>/dev/null | grep -q 'auth_ok'; then
    echo "runtime role authenticates successfully"
  else
    echo "WARNING: runtime role authentication test failed" >&2
  fi

  # Verify prod DATABASE_URL was NOT touched
  echo "--- verifying prod DATABASE_URL unchanged ---"
  if grep -q "^DATABASE_URL=.*${RUNTIME_ROLE}" "$ENV_FILE" 2>/dev/null; then
    echo "CRITICAL: DATABASE_URL contains staging role ${RUNTIME_ROLE} — THIS IS A BUG" >&2
    exit 1
  fi
  echo "prod DATABASE_URL is unchanged (confirmed)"

  echo ""
  echo "=== Staging rotation complete ==="
  echo "Password handoff: ${HANDOFF}"
  echo ""
  echo "Manual steps for Shawn:"
  echo "  1. Update GitHub Actions secret (if applicable):"
  echo "     ssh root@VPS 'cat ${HANDOFF}' | gh secret set STAGING_DB_PASSWORD --repo shawnseffernick175/gda-command-v2"
  echo "  2. Delete handoff file:"
  echo "     rm ${HANDOFF}"
  exit 0
fi

# ── Prod path continues: restart backend + health checks ───────────────────

# 5. Restart backend (using service name, not container name)
echo "--- restarting backend (service: ${BACKEND_SERVICE}) ---"
cd "$DEPLOY_DIR"
docker compose -f "$COMPOSE_FILE" up -d --build "$BACKEND_SERVICE"

# 6. Wait for container healthy
echo "--- waiting for container health ---"
for i in $(seq 1 20); do
  status=$(docker inspect "$BACKEND_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [ "$status" = "healthy" ]; then
    echo "container healthy (attempt ${i})"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "WARNING: container not healthy after 60s (status: ${status})" >&2
    echo "Check logs: docker logs ${BACKEND_CONTAINER}" >&2
  fi
  sleep 3
done

# 7. Health check — simple /health first, then deeper sentinel endpoint
echo "--- health check: /health (simple gate) ---"
for i in $(seq 1 20); do
  http_code=$(docker exec "$BACKEND_CONTAINER" \
    wget -qO /dev/null -S "http://localhost:3001/health" 2>&1 \
    | grep -i "HTTP/" | tail -1 | awk '{print $2}') || http_code="000"
  if [ "$http_code" = "200" ]; then
    echo "/health passed (attempt ${i})"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "WARNING: /health failed after 20 attempts" >&2
  fi
  echo "  attempt ${i}/20: HTTP ${http_code}"
  sleep 3
done

echo "--- health check: /api/sentinel/current (deep check) ---"
for i in $(seq 1 10); do
  http_code=$(docker exec "$BACKEND_CONTAINER" \
    wget -qO /dev/null -S "http://localhost:3001/api/sentinel/current" 2>&1 \
    | grep -i "HTTP/" | tail -1 | awk '{print $2}') || http_code="000"
  if [ "$http_code" = "200" ]; then
    echo "/api/sentinel/current passed (attempt ${i})"
    break
  fi
  if [ "$i" -eq 10 ]; then
    echo "WARNING: sentinel check failed after 10 attempts (non-critical)" >&2
    echo "Backend is up (/health passed) but sentinel data may not be available yet" >&2
  fi
  echo "  attempt ${i}/10: HTTP ${http_code}"
  sleep 3
done

# 8. Verify runtime role can authenticate with new password
echo "--- verifying runtime role authentication ---"
if docker exec -e PGPASSWORD="$NEW_PW" "$PG_CONTAINER" \
    psql -U "$RUNTIME_ROLE" -d "$DB_NAME" -t -A -c "SELECT 'auth_ok'" 2>/dev/null | grep -q 'auth_ok'; then
  echo "runtime role authenticates successfully"
else
  echo "WARNING: runtime role authentication test failed" >&2
fi

echo ""
echo "=== Rotation complete ==="
echo "Password handoff: ${HANDOFF}"
echo ""
echo "Manual steps for Shawn:"
echo "  1. Copy password to n8n credential HwronxMmGY5XDGEt:"
echo "     cat ${HANDOFF}"
echo "  2. Copy password to GitHub Actions secret (if needed):"
echo "     ssh root@VPS 'cat ${HANDOFF}' | gh secret set GDA_RUNTIME_PASSWORD --repo shawnseffernick175/gda-command-v2"
echo "  3. Delete handoff file:"
echo "     rm ${HANDOFF}"
