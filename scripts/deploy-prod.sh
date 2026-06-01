#!/usr/bin/env bash
# deploy-prod.sh — runs ON the production VPS via SSH from GitHub Actions.
# Usage: bash deploy-prod.sh [true|false]
#   Arg 1: dry_run (default: false). When true, only git pull; skip compose up.
#
# F-315c gates: pre-deploy DB snapshot, SHA image tags, HTTP health checks,
# 30-second verification window, automatic rollback on failure.
set -euo pipefail

DRY_RUN="${1:-false}"
DEPLOY_DIR="/root/gda-command-v2"
COMPOSE_FILE="docker-compose.prod.yml"
SERVICES="backend-v3 frontend-v3 gda-agent-v3"
BACKEND_CONTAINER="gda-backend-v3"
FRONTEND_CONTAINER="gda-frontend-v3"
AGENT_CONTAINER="gda-agent-v3"
BACKUP_DIR="/root/gda-backups"
DOCKER_NETWORK="gda-command-v2_gda"

cd "$DEPLOY_DIR"

echo "=== deploy-prod.sh ==="
echo "dry_run=${DRY_RUN}"
echo "dir=${DEPLOY_DIR}"

# ---------- Capture previous SHA for rollback ----------
PREV_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "none")
echo "prev_sha=${PREV_SHA}"

# ---------- Pull latest main ----------
echo "--- git fetch + reset ---"
git fetch origin
git reset --hard origin/main
DEPLOY_SHA=$(git rev-parse --short HEAD)
DEPLOY_SHA_FULL=$(git rev-parse HEAD)
echo "deploy_sha=${DEPLOY_SHA}"

if [ "$DRY_RUN" = "true" ]; then
  echo "DEPLOY_DRY_RUN ${DEPLOY_SHA}"
  exit 0
fi

# ---------- Record workflow start time for verification ----------
DEPLOY_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "deploy_start=${DEPLOY_START}"

# ---------- Rollback function ----------
rollback() {
  local REASON="${1:-unknown}"
  echo "=== ROLLBACK triggered: ${REASON} ==="

  # Restore previous images if tagged
  if [ "$PREV_SHA" != "none" ]; then
    echo "--- restoring images tagged ${PREV_SHA} ---"
    for SVC in backend-v3 frontend-v3; do
      PREV_IMG="gda-command-v2-${SVC}:${PREV_SHA}"
      if docker image inspect "$PREV_IMG" >/dev/null 2>&1; then
        docker tag "$PREV_IMG" "gda-command-v2-${SVC}:latest"
        echo "restored ${SVC} image to ${PREV_SHA}"
      else
        echo "WARNING: no previous image ${PREV_IMG} — cannot restore ${SVC}"
      fi
    done
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps $SERVICES 2>/dev/null || true
  fi

  # Restore DB from snapshot if available
  LATEST_SNAPSHOT=$(ls -t "${BACKUP_DIR}"/pre-deploy-*.sql.gz 2>/dev/null | head -1 || true)
  if [ -n "$LATEST_SNAPSHOT" ]; then
    echo "--- DB snapshot available for manual restore: ${LATEST_SNAPSHOT} ---"
    echo "ROLLBACK_DB_SNAPSHOT=${LATEST_SNAPSHOT}"
  fi

  echo "DEPLOY_ROLLED_BACK reason=${REASON} prev_sha=${PREV_SHA}"
}

# ---------- Stop and remove V2 containers if still running ----------
echo "--- removing V2 containers (if present) ---"
docker rm -f gda-backend gda-frontend 2>/dev/null || true
docker rmi gda-command-v2-backend:latest gda-command-v2-frontend:latest 2>/dev/null || true

# ---------- Resolve DATABASE_URL ----------
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

# ---------- F-315c: Pre-deploy DB snapshot ----------
echo "--- pre-deploy DB snapshot ---"
mkdir -p "$BACKUP_DIR"
SNAPSHOT_FILE="${BACKUP_DIR}/pre-deploy-${DEPLOY_SHA}-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"

set +e
docker run --rm --network "$DOCKER_NETWORK" \
  -v "${BACKUP_DIR}:/backups" \
  postgres:16-alpine sh -c "
    pg_dump '${DB_URL}' | gzip > '/backups/$(basename "$SNAPSHOT_FILE")'
  " 2>&1
SNAPSHOT_RC=$?
set -e

if [ "$SNAPSHOT_RC" -ne 0 ]; then
  echo "WARNING: pre-deploy snapshot failed (rc=${SNAPSHOT_RC}) — continuing without snapshot"
else
  SNAPSHOT_SIZE=$(stat -c%s "$SNAPSHOT_FILE" 2>/dev/null || echo "0")
  echo "SNAPSHOT_OK: ${SNAPSHOT_FILE} (${SNAPSHOT_SIZE} bytes)"
fi

# Prune old snapshots (keep last 10)
ls -t "${BACKUP_DIR}"/pre-deploy-*.sql.gz 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

# ---------- Apply V3 migrations ----------
echo "--- applying V3 migrations ---"

echo "--- migration plan ---"
docker run --rm --network "$DOCKER_NETWORK" \
  -e PGPASSWORD=unused \
  -v "${DEPLOY_DIR}:/work" -w /work \
  postgres:16-alpine \
  psql "$DB_URL" -c "SELECT filename, applied_at FROM v3_schema_migrations ORDER BY id DESC LIMIT 10;" 2>/dev/null || echo "(no existing migration table — first run)"
find db/v3/migrations/ -maxdepth 1 -name 'v3_[0-9][0-9][0-9]_*.sql' -printf '%f\n' | sort | tail -20

MIGRATE_LOG=$(mktemp)
set +e
docker run --rm --network "$DOCKER_NETWORK" \
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
  rollback "migration failed (rc=${MIGRATE_RC})"
  exit 1
fi

if grep -qE "Applied [0-9]+ V3 migration\(s\) successfully" "$MIGRATE_LOG"; then
  APPLIED_LINE=$(grep -E "Applied [0-9]+ V3 migration\(s\)" "$MIGRATE_LOG" | tail -1)
  echo "MIGRATE_OK: ${APPLIED_LINE}"
elif grep -q "V3 schema is up to date" "$MIGRATE_LOG"; then
  echo "MIGRATE_OK: no pending migrations"
elif grep -q "No V3 migrations found" "$MIGRATE_LOG"; then
  echo "MIGRATE_OK: no migration files present"
else
  echo "DEPLOY_FAILED migrate.ts output did not match expected success pattern"
  tail -20 "$MIGRATE_LOG"
  rm -f "$MIGRATE_LOG"
  rollback "migration output unexpected"
  exit 1
fi

rm -f "$MIGRATE_LOG"

# ---------- Build and deploy V3 ----------
echo "--- docker compose build + force-recreate ---"
docker compose -f "$COMPOSE_FILE" build \
  --build-arg DEPLOY_COMMIT_SHA="$DEPLOY_SHA_FULL" \
  $SERVICES

# ---------- F-315c: Tag images with commit SHA ----------
echo "--- tagging images with SHA ${DEPLOY_SHA} ---"
for SVC in backend-v3 frontend-v3; do
  IMG="gda-command-v2-${SVC}:latest"
  if docker image inspect "$IMG" >/dev/null 2>&1; then
    docker tag "$IMG" "gda-command-v2-${SVC}:${DEPLOY_SHA}"
    echo "tagged ${IMG} → gda-command-v2-${SVC}:${DEPLOY_SHA}"
  fi
done

docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps $SERVICES

# ---------- Clean dangling images (but preserve SHA-tagged) ----------
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
    rollback "backend-v3 not healthy"
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
    rollback "frontend-v3 not healthy"
    exit 1
  fi
  sleep 3
done

# ---------- Wait for gda-agent-v3 container healthy ----------
echo "--- waiting for gda-agent-v3 health ---"
for i in $(seq 1 30); do
  status=$(docker inspect "$AGENT_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [ "$status" = "healthy" ]; then
    echo "gda-agent-v3 healthy (attempt ${i})"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "DEPLOY_FAILED gda-agent-v3 not healthy after 90s (status: ${status})"
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
  rollback "container not recreated"
  exit 1
fi

# ---------- Verification: auth route exists in built code ----------
echo "--- verifying auth/login route in backend-v3 ---"
AUTH_CHECK=$(docker exec "$BACKEND_CONTAINER" grep -r 'auth/login' /app/apps/backend-v3/dist/ 2>/dev/null | head -1 || true)
if [ -z "$AUTH_CHECK" ]; then
  echo "DEPLOY_FAILED auth/login route not found in backend-v3 dist — image may be stale"
  rollback "auth route missing"
  exit 1
fi
echo "auth route verified: ${AUTH_CHECK}"

# ---------- F-315c: HTTP health checks (30-second verification window) ----------
echo "--- F-315c: 30-second HTTP health verification window ---"
HEALTH_ENDPOINTS="/v3/health /v3/ready"
HEALTH_PASS=true
HEALTH_LOG=""

for ATTEMPT in $(seq 1 6); do
  ALL_OK=true
  for EP in $HEALTH_ENDPOINTS; do
    HTTP_CODE=$(docker exec "$BACKEND_CONTAINER" wget -qO- -S "http://127.0.0.1:4000${EP}" 2>&1 | grep "HTTP/" | tail -1 | awk '{print $2}' || echo "000")
    # Alternative: use the response body
    BODY=$(docker exec "$BACKEND_CONTAINER" wget -qO- "http://127.0.0.1:4000${EP}" 2>/dev/null || echo '{"status":"error"}')
    STATUS=$(echo "$BODY" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
    echo "  check ${EP}: status=${STATUS} (attempt ${ATTEMPT}/6)"
    HEALTH_LOG="${HEALTH_LOG}\n  ${EP}: status=${STATUS} (attempt ${ATTEMPT})"
    if [ "$STATUS" != "ok" ] && [ "$STATUS" != "ready" ]; then
      ALL_OK=false
    fi
  done

  if [ "$ALL_OK" = "true" ]; then
    echo "All health endpoints passing (attempt ${ATTEMPT})"
    break
  fi

  if [ "$ATTEMPT" -eq 6 ]; then
    echo "DEPLOY_FAILED health checks did not pass within 30-second window"
    echo -e "Health check log:${HEALTH_LOG}"
    HEALTH_PASS=false
  fi

  sleep 5
done

if [ "$HEALTH_PASS" != "true" ]; then
  rollback "health checks failed"
  exit 1
fi

# ---------- F-315c: Prune old SHA-tagged images (keep last 5) ----------
echo "--- pruning old SHA-tagged images ---"
for SVC in backend-v3 frontend-v3; do
  docker images "gda-command-v2-${SVC}" --format '{{.Tag}}' \
    | grep -v latest \
    | sort -r \
    | tail -n +6 \
    | xargs -I{} docker rmi "gda-command-v2-${SVC}:{}" 2>/dev/null || true
done

# ---------- Collect deploy metadata for notifications ----------
DEPLOY_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
AUTHOR=$(git log -1 --format='%an <%ae>')
FILES_CHANGED=$(git diff --name-only "${PREV_SHA}..${DEPLOY_SHA}" 2>/dev/null | head -20 || echo "(diff unavailable)")
FILES_COUNT=$(git diff --name-only "${PREV_SHA}..${DEPLOY_SHA}" 2>/dev/null | wc -l || echo "?")

echo "=== DEPLOY SUMMARY ==="
echo "DEPLOY_SHA=${DEPLOY_SHA}"
echo "DEPLOY_SHA_FULL=${DEPLOY_SHA_FULL}"
echo "PREV_SHA=${PREV_SHA}"
echo "DEPLOY_START=${DEPLOY_START}"
echo "DEPLOY_END=${DEPLOY_END}"
echo "AUTHOR=${AUTHOR}"
echo "FILES_CHANGED_COUNT=${FILES_COUNT}"
echo "SNAPSHOT=${SNAPSHOT_FILE}"
echo "HEALTH_STATUS=passing"

echo "DEPLOY_OK ${DEPLOY_SHA}"
exit 0
