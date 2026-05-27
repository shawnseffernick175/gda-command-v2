#!/usr/bin/env bash
# rotate-gda-runtime-credential.sh — Rotate gda_runtime password + update DATABASE_URL.
# Run ON the VPS. Generates new password, updates Postgres + .env, restarts backend, verifies health.
#
# Shawn's only manual step: copy password from handoff file to:
#   1. n8n credential HwronxMmGY5XDGEt (GDA Postgres)
#   2. GitHub Actions secret (if applicable)
#
# Usage: bash scripts/rotate-gda-runtime-credential.sh [prod|staging]
set -euo pipefail

ENV="${1:-prod}"

case "$ENV" in
  prod)
    CONTAINER="gda-postgres"
    DB_USER="gda"
    DB_NAME="gda"
    RUNTIME_ROLE="gda_runtime"
    BACKEND_CONTAINER="gda-backend"
    ;;
  staging)
    CONTAINER="gda-postgres-staging"
    DB_USER="gda_staging"
    DB_NAME="gda_command_staging"
    RUNTIME_ROLE="gda_staging_rt"
    BACKEND_CONTAINER="gda-backend"
    ;;
  *)
    echo "Usage: $0 [prod|staging]" >&2
    exit 1
    ;;
esac

DEPLOY_DIR="/root/gda-command-v2"
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE="${DEPLOY_DIR}/.env"
HANDOFF="/tmp/gda-runtime-pw-shawn-readonly"
HEALTH_ENDPOINT="http://localhost:3001/api/sentinel/current"
HEALTH_MAX_ATTEMPTS=30
HEALTH_INTERVAL=3

echo "=== rotate-gda-runtime-credential.sh ==="
echo "env=${ENV}  role=${RUNTIME_ROLE}"

# Verify role exists before rotating
if ! docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
    -c "SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}'" | grep -q '1'; then
  echo "ERROR: role ${RUNTIME_ROLE} does not exist. Run bootstrap-gda-runtime.sh first." >&2
  exit 1
fi

# 1. Generate 32-char alphanumeric password
NEW_PW=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)
echo "--- generated 32-char password ---"

# 2. ALTER ROLE in Postgres
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "ALTER ROLE ${RUNTIME_ROLE} PASSWORD '${NEW_PW}'"
echo "--- password updated in Postgres ---"

# 3. Write handoff file
echo -n "$NEW_PW" > "$HANDOFF"
chmod 400 "$HANDOFF"
echo "--- handoff file: ${HANDOFF} ---"

# 4. Update DATABASE_URL in .env
#    Password is alphanumeric-only so no URL-encoding needed, but encode for safety.
ENCODED_PW=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${NEW_PW}', safe=''))")
NEW_URL="postgresql://${RUNTIME_ROLE}:${ENCODED_PW}@postgres:5432/${DB_NAME}"

if grep -q "^DATABASE_URL=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${NEW_URL}|" "$ENV_FILE"
  echo "--- DATABASE_URL updated in .env ---"
else
  echo "DATABASE_URL=${NEW_URL}" >> "$ENV_FILE"
  echo "--- DATABASE_URL added to .env ---"
fi

# 5. Restart backend
echo "--- restarting backend ---"
cd "$DEPLOY_DIR"
docker compose -f "$COMPOSE_FILE" up -d --build "$BACKEND_CONTAINER"

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

# 7. Health check — Sentinel endpoint
echo "--- health check: ${HEALTH_ENDPOINT} ---"
for i in $(seq 1 "$HEALTH_MAX_ATTEMPTS"); do
  http_code=$(docker exec "$BACKEND_CONTAINER" \
    wget -qO /dev/null -S "$HEALTH_ENDPOINT" 2>&1 \
    | grep -i "HTTP/" | tail -1 | awk '{print $2}') || http_code="000"
  if [ "$http_code" = "200" ]; then
    echo "health check passed (attempt ${i})"
    break
  fi
  if [ "$i" -eq "$HEALTH_MAX_ATTEMPTS" ]; then
    echo "WARNING: health check failed after ${HEALTH_MAX_ATTEMPTS} attempts" >&2
    echo "Backend may need manual investigation" >&2
  fi
  echo "attempt ${i}/${HEALTH_MAX_ATTEMPTS}: HTTP ${http_code}"
  sleep "$HEALTH_INTERVAL"
done

# 8. Verify runtime role can authenticate with new password
echo "--- verifying runtime role authentication ---"
if docker exec -e PGPASSWORD="$NEW_PW" "$CONTAINER" \
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
