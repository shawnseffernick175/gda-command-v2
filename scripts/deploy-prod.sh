#!/usr/bin/env bash
# deploy-prod.sh — runs ON the production VPS via SSH from GitHub Actions.
# Usage: bash deploy-prod.sh [true|false]
#   Arg 1: dry_run (default: false). When true, only git pull; skip compose up.
set -euo pipefail

DRY_RUN="${1:-false}"
DEPLOY_DIR="/root/gda-command-v2"
COMPOSE_FILE="docker-compose.prod.yml"
SERVICES="backend-v3 frontend-v3"
BACKEND_CONTAINER="gda-backend-v3"
FRONTEND_CONTAINER="gda-frontend-v3"

cd "$DEPLOY_DIR"

echo "=== deploy-prod.sh ==="
echo "dry_run=${DRY_RUN}"
echo "dir=${DEPLOY_DIR}"

# ---------- Pull latest main ----------
echo "--- git fetch + reset ---"
git fetch origin
git reset --hard origin/main
DEPLOY_SHA=$(git rev-parse --short HEAD)
echo "deploy_sha=${DEPLOY_SHA}"

if [ "$DRY_RUN" = "true" ]; then
  echo "DEPLOY_DRY_RUN ${DEPLOY_SHA}"
  exit 0
fi

# ---------- Record workflow start time for verification ----------
DEPLOY_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "deploy_start=${DEPLOY_START}"

# ---------- Drift check: n8n compose ----------
N8N_COMPOSE="/root/n8n-envision/docker-compose.yml"
REPO_N8N_COMPOSE="docker-compose.n8n.yml"
if [ -f "$N8N_COMPOSE" ] && [ -f "$REPO_N8N_COMPOSE" ]; then
  VPS_HASH=$(sha256sum "$N8N_COMPOSE" | awk '{print $1}')
  REPO_HASH=$(sha256sum "$REPO_N8N_COMPOSE" | awk '{print $1}')
  if [ "$VPS_HASH" != "$REPO_HASH" ]; then
    echo "::warning::COMPOSE DRIFT: VPS $N8N_COMPOSE hash ($VPS_HASH) != repo $REPO_N8N_COMPOSE hash ($REPO_HASH). Reconcile before next n8n restart."
  else
    echo "n8n compose: no drift (hash match)"
  fi
fi

# ---------- Stop and remove V2 containers if still running ----------
echo "--- removing V2 containers (if present) ---"
docker rm -f gda-backend gda-frontend 2>/dev/null || true
docker rmi gda-command-v2-backend:latest gda-command-v2-frontend:latest 2>/dev/null || true

# ---------- Apply V3 migrations (BEFORE recreating backend) ----------
echo "--- applying V3 migrations ---"

# Read staging DATABASE_URL from currently-running backend-v3 (it has the staging creds)
# Fall back to env file if container is missing (first deploy).
DB_URL=$(docker inspect gda-backend-v3 --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep '^DATABASE_URL=' | head -1 | cut -d= -f2- || true)

if [ -z "$DB_URL" ]; then
  if [ -f /root/gda-command-v2/.env.prod ]; then
    DB_URL=$(grep '^DATABASE_URL=' /root/gda-command-v2/.env.prod | head -1 | cut -d= -f2-)
  fi
fi

if [ -z "$DB_URL" ]; then
  echo "DEPLOY_FAILED could not resolve DATABASE_URL for migration step"
  exit 1
fi

# Show migration plan (informational)
echo "--- migration plan ---"
docker run --rm --network gda-command-v2_gda \
  -e PGPASSWORD="${DB_URL##*:}" \
  -v "${DEPLOY_DIR}:/work" -w /work \
  postgres:16-alpine \
  psql "$DB_URL" -c "SELECT filename, applied_at FROM v3_schema_migrations ORDER BY id DESC LIMIT 10;" 2>/dev/null || echo "(no existing migration table — first run)"
find db/v3/migrations/ -maxdepth 1 -name 'v3_[0-9][0-9][0-9]_*.sql' -printf '%f\n' | sort | tail -20

# Run migrate.ts in an ephemeral node:20-alpine container mounted at /work.
# Network: gda-command-v2_gda so it can reach gda-postgres-staging by service name.
MIGRATE_LOG=$(mktemp)
set +e
docker run --rm --network gda-command-v2_gda \
  -v "${DEPLOY_DIR}:/work" -w /work \
  -e V3_DATABASE_URL="$DB_URL" \
  node:20-alpine sh -c "
    set -e
    npm install --no-audit --no-fund --silent --prefix /tmp/migrate-deps tsx pg >/dev/null 2>&1
    NODE_PATH=/tmp/migrate-deps/node_modules npx --prefix /tmp/migrate-deps tsx db/v3/migrate.ts
  " 2>&1 | tee "$MIGRATE_LOG"
MIGRATE_RC=${PIPESTATUS[0]}
set -e

if [ "$MIGRATE_RC" -ne 0 ]; then
  echo "DEPLOY_FAILED migrate.ts exited with code ${MIGRATE_RC}"
  echo "--- last 40 lines of migrate output ---"
  tail -40 "$MIGRATE_LOG"
  rm -f "$MIGRATE_LOG"
  exit 1
fi

# Detect "applied X migration(s)" or "up to date" from output
if grep -qE "Applied [0-9]+ V3 migration\(s\) successfully" "$MIGRATE_LOG"; then
  APPLIED_LINE=$(grep -E "Applied [0-9]+ V3 migration\(s\)" "$MIGRATE_LOG" | tail -1)
  echo "MIGRATE_OK: ${APPLIED_LINE}"
elif grep -q "V3 schema is up to date" "$MIGRATE_LOG"; then
  echo "MIGRATE_OK: no pending migrations"
else
  echo "DEPLOY_FAILED migrate.ts output did not match expected success pattern"
  tail -20 "$MIGRATE_LOG"
  rm -f "$MIGRATE_LOG"
  exit 1
fi

rm -f "$MIGRATE_LOG"

# ---------- Build and deploy V3 ----------
echo "--- docker compose build + force-recreate ---"
docker compose -f "$COMPOSE_FILE" build $SERVICES
docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps $SERVICES

# ---------- Clean dangling images ----------
echo "--- pruning dangling images ---"
docker image prune -f

# ---------- Wait for backend-v3 container healthy ----------
echo "--- waiting for backend-v3 health ---"
for i in $(seq 1 20); do
  status=$(docker inspect "$BACKEND_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [ "$status" = "healthy" ]; then
    echo "backend-v3 healthy (attempt ${i})"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "DEPLOY_FAILED backend-v3 not healthy after 60s (status: ${status})"
    exit 1
  fi
  sleep 3
done

# ---------- Wait for frontend-v3 container healthy ----------
echo "--- waiting for frontend-v3 health ---"
for i in $(seq 1 20); do
  status=$(docker inspect "$FRONTEND_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [ "$status" = "healthy" ]; then
    echo "frontend-v3 healthy (attempt ${i})"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "DEPLOY_FAILED frontend-v3 not healthy after 60s (status: ${status})"
    exit 1
  fi
  sleep 3
done

# ---------- Verification: StartedAt must be after deploy start ----------
echo "--- verifying container recreation ---"
BACKEND_STARTED=$(docker inspect "$BACKEND_CONTAINER" --format '{{.State.StartedAt}}')
echo "backend-v3 StartedAt: ${BACKEND_STARTED}"
if [[ "$BACKEND_STARTED" < "$DEPLOY_START" ]]; then
  echo "DEPLOY_FAILED backend-v3 StartedAt (${BACKEND_STARTED}) is before deploy start (${DEPLOY_START}) — container was not recreated"
  exit 1
fi

# ---------- Verification: auth route exists in built code ----------
echo "--- verifying auth/login route in backend-v3 ---"
AUTH_CHECK=$(docker exec "$BACKEND_CONTAINER" grep -r 'auth/login' /app/apps/backend-v3/dist/ 2>/dev/null | head -1 || true)
if [ -z "$AUTH_CHECK" ]; then
  echo "DEPLOY_FAILED auth/login route not found in backend-v3 dist — image may be stale"
  exit 1
fi
echo "auth route verified: ${AUTH_CHECK}"

echo "DEPLOY_OK ${DEPLOY_SHA}"
exit 0
