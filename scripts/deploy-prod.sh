#!/usr/bin/env bash
# deploy-prod.sh — runs ON the production VPS via SSH from GitHub Actions.
# Usage: bash deploy-prod.sh [true|false]
#   Arg 1: dry_run (default: false). When true, only git pull; skip compose up.
set -euo pipefail

DRY_RUN="${1:-false}"
DEPLOY_DIR="/root/gda-command-v2"
COMPOSE_FILE="docker-compose.prod.yml"
COMPOSE_SERVICE="backend"
CONTAINER_NAME="gda-backend"
BACKEND_PORT="3001"
HEALTH_ENDPOINT="http://localhost:${BACKEND_PORT}/api/sentinel/current"
HEALTH_MAX_ATTEMPTS=30
HEALTH_INTERVAL=3

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

# ---------- Record previous image for rollback ----------
echo "--- recording previous image ---"
docker inspect "$CONTAINER_NAME" --format '{{.Image}}' > /tmp/prev_image.txt 2>/dev/null \
  || echo "no-prev" > /tmp/prev_image.txt
echo "prev_image=$(cat /tmp/prev_image.txt)"

# ---------- Build and deploy ----------
echo "--- docker compose build + up ---"
docker compose -f "$COMPOSE_FILE" up -d --build "$COMPOSE_SERVICE"

# ---------- Wait for container healthy ----------
echo "--- waiting for container health ---"
for i in $(seq 1 20); do
  status=$(docker inspect "$CONTAINER_NAME" --format '{{.State.Health.Status}}' 2>/dev/null || echo "missing")
  if [ "$status" = "healthy" ]; then
    echo "container healthy (attempt ${i})"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "prev_image=$(cat /tmp/prev_image.txt)"
    echo "DEPLOY_FAILED container not healthy after 60s (status: ${status})"
    exit 1
  fi
  sleep 3
done

# ---------- Health check — Sentinel endpoint ----------
echo "--- health check: ${HEALTH_ENDPOINT} ---"
for i in $(seq 1 "$HEALTH_MAX_ATTEMPTS"); do
  http_code=$(docker exec "$CONTAINER_NAME" \
    wget -qO /dev/null -S "$HEALTH_ENDPOINT" 2>&1 \
    | grep -i "HTTP/" | tail -1 | awk '{print $2}') || http_code="000"
  if [ "$http_code" = "200" ]; then
    echo "health check passed (attempt ${i})"
    echo "DEPLOY_OK ${DEPLOY_SHA}"
    exit 0
  fi
  echo "attempt ${i}/${HEALTH_MAX_ATTEMPTS}: HTTP ${http_code}"
  sleep "$HEALTH_INTERVAL"
done

echo "prev_image=$(cat /tmp/prev_image.txt)"
echo "DEPLOY_FAILED health check failed after ${HEALTH_MAX_ATTEMPTS} attempts — manual rollback required"
exit 1
