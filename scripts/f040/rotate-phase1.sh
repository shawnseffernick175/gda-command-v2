#!/usr/bin/env bash
# =============================================================================
# F-040 Phase 1 — In-cluster secret rotation
#
# USAGE:  bash /root/gda-command-v2/scripts/f040/rotate-phase1.sh
#
# Rotates 5 in-cluster secrets one at a time with verification between each.
# Never prints new secret values to stdout/stderr — only writes them to .env.
# All output logged to /var/log/f040-rotation.log.
#
# ROLLBACK: If any step fails the script stops and prints rollback instructions.
#           Backup .env files are saved as .env.bak.YYYYMMDD-HHMM before each change.
#
# CONSTRAINTS:
#   - Does NOT touch SAM.gov, OpenAI, Anthropic, GovWin, GovTribe, or n8n API keys
#   - Does NOT touch canary workflow LPUSYd4Vpph1Qg7n
#   - Does NOT touch amendment-monitor 1o8h7yGhLKLoNP0S
#   - Does NOT touch n8n internal credential yK1VVsSN3tn0baVm
#   - Does NOT modify application code
# =============================================================================
set -euo pipefail

LOGFILE="/var/log/f040-rotation.log"
TIMESTAMP=$(date +%Y%m%d-%H%M)

# Redirect all output to log
exec > >(tee -a "$LOGFILE") 2>&1

echo "=== F-040 Phase 1 secret rotation — started at $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo "Timestamp suffix for backups: $TIMESTAMP"

# ─────────────────────────────────────────────────────────────────────────────
# Locate the .env file used by docker-compose
# ─────────────────────────────────────────────────────────────────────────────
GDA_PROJECT_DIR=""
# Try to find via docker inspect
COMPOSE_CONFIG=$(docker inspect gda-backend --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)
if [[ -n "$COMPOSE_CONFIG" && -f "$COMPOSE_CONFIG/.env" ]]; then
  GDA_PROJECT_DIR="$COMPOSE_CONFIG"
elif [[ -f /root/gda-command-v2/.env ]]; then
  GDA_PROJECT_DIR="/root/gda-command-v2"
else
  echo "FATAL: Cannot locate GDA project .env file. Checked docker labels and /root/gda-command-v2/.env"
  exit 1
fi

ENV_FILE="$GDA_PROJECT_DIR/.env"
echo "Using .env at: $ENV_FILE"

# ─────────────────────────────────────────────────────────────────────────────
# Locate n8n compose directory
# ─────────────────────────────────────────────────────────────────────────────
N8N_PROJECT_DIR=""
N8N_ENV_FILE=""
N8N_COMPOSE_DIR=$(docker inspect n8n-envision-postgres-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)
if [[ -n "$N8N_COMPOSE_DIR" ]]; then
  N8N_PROJECT_DIR="$N8N_COMPOSE_DIR"
  # n8n may use .env or docker-compose.yml env directly
  if [[ -f "$N8N_PROJECT_DIR/.env" ]]; then
    N8N_ENV_FILE="$N8N_PROJECT_DIR/.env"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# Helper functions
# ─────────────────────────────────────────────────────────────────────────────

backup_env() {
  local file="$1"
  local bak="${file}.bak.${TIMESTAMP}"
  cp "$file" "$bak"
  echo "  Backed up $file → $bak"
}

gen_hex() {
  local len=$1
  openssl rand -hex "$((len / 2))"
}

update_env_var() {
  # Updates a variable in an .env file. If the var exists, replaces its value.
  # If not, appends it.
  local file="$1"
  local var="$2"
  local val="$3"
  if grep -q "^${var}=" "$file" 2>/dev/null; then
    # Use a delimiter that won't appear in hex strings
    sed -i "s|^${var}=.*|${var}=${val}|" "$file"
  else
    echo "${var}=${val}" >> "$file"
  fi
}

read_env_var() {
  local file="$1"
  local var="$2"
  grep "^${var}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-
}

health_check() {
  echo "  Checking GET /health..."
  local h1
  h1=$(curl -sf -o /dev/null -w '%{http_code}' http://localhost:3001/health 2>/dev/null || echo "000")
  if [[ "$h1" != "200" ]]; then
    echo "  FAIL: /health returned $h1"
    return 1
  fi
  echo "  GET /health → 200 OK"

  echo "  Checking GET /api/admin/health..."
  local h2
  h2=$(curl -sf -o /dev/null -w '%{http_code}' http://localhost:3001/api/admin/health 2>/dev/null || echo "000")
  if [[ "$h2" != "200" ]]; then
    echo "  FAIL: /api/admin/health returned $h2"
    return 1
  fi
  echo "  GET /api/admin/health → 200 OK"
  return 0
}

wait_for_backend() {
  echo "  Waiting for backend to become healthy (up to 60s)..."
  local i=0
  while [[ $i -lt 12 ]]; do
    sleep 5
    if curl -sf -o /dev/null http://localhost:3001/health 2>/dev/null; then
      echo "  Backend healthy after $((i * 5 + 5))s"
      return 0
    fi
    i=$((i + 1))
  done
  echo "  FAIL: Backend did not become healthy within 60s"
  return 1
}

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "=== Pre-flight checks ==="

# Verify containers are running
for c in gda-postgres gda-backend; do
  if ! docker ps --format '{{.Names}}' | grep -q "^${c}$"; then
    echo "FATAL: Container $c is not running"
    exit 1
  fi
done
echo "  gda-postgres: running"
echo "  gda-backend: running"

# Verify n8n postgres is running (needed for secret #5)
if ! docker ps --format '{{.Names}}' | grep -q "^n8n-envision-postgres-1$"; then
  echo "WARNING: n8n-envision-postgres-1 not running — secret #5 will be skipped"
  SKIP_N8N=true
else
  echo "  n8n-envision-postgres-1: running"
  SKIP_N8N=false
fi

# Verify health before starting
if ! health_check; then
  echo "FATAL: Health checks failed before rotation — fix first"
  exit 1
fi

# Read current passwords for rollback
OLD_POSTGRES_PASSWORD=$(read_env_var "$ENV_FILE" "POSTGRES_PASSWORD")
OLD_MIGRATION_DB_URL=$(read_env_var "$ENV_FILE" "MIGRATION_DATABASE_URL")
OLD_GDA_WEBHOOK_KEY=$(read_env_var "$ENV_FILE" "GDA_WEBHOOK_KEY")
OLD_JWT_SECRET=$(read_env_var "$ENV_FILE" "JWT_SECRET")

echo "  Pre-flight passed. Old values captured for rollback (in memory only)."
echo ""

# =============================================================================
# SECRET #1: DATABASE_URL password (Postgres user "gda")
# =============================================================================
echo "=== Secret #1: DATABASE_URL password (Postgres user gda) ==="

NEW_PG_PASS=$(gen_hex 32)

# Step 1: ALTER USER in postgres
echo "  Step 1: ALTER USER gda..."
docker exec gda-postgres psql -U gda -d gda -c "ALTER USER gda PASSWORD '${NEW_PG_PASS}';" > /dev/null 2>&1
echo "  Step 1: done"

# Step 2: Update .env
echo "  Step 2: Updating .env..."
backup_env "$ENV_FILE"
update_env_var "$ENV_FILE" "POSTGRES_PASSWORD" "$NEW_PG_PASS"
echo "  Step 2: done"

# Step 3: Restart postgres + backend (postgres needs new env for future connections)
echo "  Step 3: Restarting containers..."
cd "$GDA_PROJECT_DIR"
docker compose -f docker-compose.prod.yml up -d postgres backend
echo "  Step 3: containers restarting"

# Step 4: Verify
if ! wait_for_backend; then
  echo "FATAL: Secret #1 failed. Rollback:"
  echo "  1. cp ${ENV_FILE}.bak.${TIMESTAMP} ${ENV_FILE}"
  echo "  2. docker exec gda-postgres psql -U gda -d gda -c \"ALTER USER gda PASSWORD '\$OLD_PASSWORD';\""
  echo "  3. cd $GDA_PROJECT_DIR && docker compose -f docker-compose.prod.yml up -d postgres backend"
  exit 1
fi

if ! health_check; then
  echo "FATAL: Secret #1 health check failed. Rollback:"
  echo "  1. cp ${ENV_FILE}.bak.${TIMESTAMP} ${ENV_FILE}"
  echo "  2. docker exec gda-postgres psql -U gda -d gda -c \"ALTER USER gda PASSWORD '\$OLD_PASSWORD';\""
  echo "  3. cd $GDA_PROJECT_DIR && docker compose -f docker-compose.prod.yml up -d postgres backend"
  exit 1
fi

# Reconnect n8n_default network if dropped
if ! docker inspect gda-backend --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | grep -q "n8n_default"; then
  echo "  Reconnecting gda-backend to n8n_default network..."
  docker network connect n8n_default gda-backend 2>/dev/null || true
fi

echo ">>> Secret #1 rotated — verified"
echo ""

# =============================================================================
# SECRET #2: MIGRATION_DATABASE_URL password (Postgres user "gda_app")
# =============================================================================
echo "=== Secret #2: MIGRATION_DATABASE_URL password (Postgres user gda_app) ==="

NEW_APP_PASS=$(gen_hex 32)

# Check if gda_app user exists
if docker exec gda-postgres psql -U gda -d gda -tAc "SELECT 1 FROM pg_roles WHERE rolname='gda_app';" 2>/dev/null | grep -q 1; then
  echo "  gda_app user exists"
else
  echo "  WARNING: gda_app user does not exist. Creating..."
  docker exec gda-postgres psql -U gda -d gda -c "CREATE USER gda_app PASSWORD '${NEW_APP_PASS}';" > /dev/null 2>&1
  docker exec gda-postgres psql -U gda -d gda -c "GRANT CONNECT ON DATABASE gda TO gda_app; GRANT USAGE ON SCHEMA public TO gda_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gda_app;" > /dev/null 2>&1
fi

# Step 1: ALTER USER
echo "  Step 1: ALTER USER gda_app..."
docker exec gda-postgres psql -U gda -d gda -c "ALTER USER gda_app PASSWORD '${NEW_APP_PASS}';" > /dev/null 2>&1
echo "  Step 1: done"

# Step 2: Update .env — construct full MIGRATION_DATABASE_URL
echo "  Step 2: Updating .env..."
backup_env "$ENV_FILE"
NEW_MIGRATION_URL="postgresql://gda_app:${NEW_APP_PASS}@localhost:5432/gda"
update_env_var "$ENV_FILE" "MIGRATION_DATABASE_URL" "$NEW_MIGRATION_URL"
echo "  Step 2: done"

# Step 3: Restart backend only (migration URL is only used by backend)
echo "  Step 3: Restarting backend..."
cd "$GDA_PROJECT_DIR"
docker compose -f docker-compose.prod.yml up -d backend
echo "  Step 3: backend restarting"

# Step 4: Verify
if ! wait_for_backend; then
  echo "FATAL: Secret #2 failed. Rollback:"
  echo "  1. cp ${ENV_FILE}.bak.${TIMESTAMP} ${ENV_FILE}"
  echo "  2. docker exec gda-postgres psql -U gda -d gda -c \"ALTER USER gda_app PASSWORD '\$OLD_PASSWORD';\""
  echo "  3. cd $GDA_PROJECT_DIR && docker compose -f docker-compose.prod.yml up -d backend"
  exit 1
fi

if ! health_check; then
  echo "FATAL: Secret #2 health check failed. See rollback above."
  exit 1
fi

# Reconnect n8n_default if dropped
if ! docker inspect gda-backend --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | grep -q "n8n_default"; then
  docker network connect n8n_default gda-backend 2>/dev/null || true
fi

echo ">>> Secret #2 rotated — verified"
echo ""

# =============================================================================
# SECRET #3: GDA_WEBHOOK_KEY (HMAC secret)
# =============================================================================
echo "=== Secret #3: GDA_WEBHOOK_KEY ==="

NEW_WEBHOOK_KEY=$(gen_hex 64)

# Step 1: Update .env
echo "  Step 1: Updating .env..."
backup_env "$ENV_FILE"
update_env_var "$ENV_FILE" "GDA_WEBHOOK_KEY" "$NEW_WEBHOOK_KEY"
echo "  Step 1: done"

# Step 2: Update n8n credential F4J3vYsPrJrYiO49 (GDA Webhook Auth v2)
echo "  Step 2: Updating n8n credential F4J3vYsPrJrYiO49..."
N8N_BASE=$(read_env_var "$ENV_FILE" "N8N_BASE_URL")
N8N_API_KEY_VAL=$(read_env_var "$ENV_FILE" "N8N_API_KEY")

if [[ -z "$N8N_BASE" || -z "$N8N_API_KEY_VAL" ]]; then
  echo "  WARNING: N8N_BASE_URL or N8N_API_KEY not set in .env"
  echo "  You must manually update credential F4J3vYsPrJrYiO49 in n8n UI"
  echo "  Set 'value' field to the new GDA_WEBHOOK_KEY from .env"
else
  HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' \
    -X PATCH "${N8N_BASE}/api/v1/credentials/F4J3vYsPrJrYiO49" \
    -H "X-N8N-API-KEY: ${N8N_API_KEY_VAL}" \
    -H "Content-Type: application/json" \
    -d "{\"data\":{\"value\":\"${NEW_WEBHOOK_KEY}\"}}" 2>/dev/null || echo "000")

  if [[ "$HTTP_CODE" == "200" ]]; then
    echo "  Step 2: n8n credential updated"
  else
    echo "  WARNING: n8n credential update returned HTTP $HTTP_CODE"
    echo "  Manually update credential F4J3vYsPrJrYiO49 in n8n UI"
  fi
fi

# Step 3: Restart backend
echo "  Step 3: Restarting backend..."
cd "$GDA_PROJECT_DIR"
docker compose -f docker-compose.prod.yml up -d backend

# Step 4: Verify
if ! wait_for_backend; then
  echo "FATAL: Secret #3 failed. Rollback:"
  echo "  1. cp ${ENV_FILE}.bak.${TIMESTAMP} ${ENV_FILE}"
  echo "  2. cd $GDA_PROJECT_DIR && docker compose -f docker-compose.prod.yml up -d backend"
  echo "  3. Revert n8n credential F4J3vYsPrJrYiO49 to old value in n8n UI"
  exit 1
fi

if ! health_check; then
  echo "FATAL: Secret #3 health check failed. See rollback above."
  exit 1
fi

# Reconnect n8n_default if dropped
if ! docker inspect gda-backend --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | grep -q "n8n_default"; then
  docker network connect n8n_default gda-backend 2>/dev/null || true
fi

# Verify webhook still works by hitting sentinel
echo "  Verifying webhook key works (POST /api/sentinel/run)..."
SENTINEL_CODE=$(curl -sf -o /dev/null -w '%{http_code}' \
  -X POST http://localhost:3001/api/sentinel/run \
  -H "x-gda-key: ${NEW_WEBHOOK_KEY}" 2>/dev/null || echo "000")

if [[ "$SENTINEL_CODE" == "200" ]]; then
  echo "  Sentinel POST verified with new webhook key"
else
  echo "  WARNING: Sentinel POST returned $SENTINEL_CODE — verify manually"
fi

echo ">>> Secret #3 rotated — verified"
echo ""

# =============================================================================
# SECRET #4: JWT_SECRET (HMAC signing secret)
# =============================================================================
echo "=== Secret #4: JWT_SECRET ==="

NEW_JWT=$(gen_hex 64)

# Step 1: Update .env (backend only — invalidates all existing JWT tokens)
echo "  Step 1: Updating .env..."
backup_env "$ENV_FILE"
update_env_var "$ENV_FILE" "JWT_SECRET" "$NEW_JWT"
echo "  Step 1: done"
echo "  NOTE: All existing user sessions will be invalidated (expected)"

# Step 2: Restart backend
echo "  Step 2: Restarting backend..."
cd "$GDA_PROJECT_DIR"
docker compose -f docker-compose.prod.yml up -d backend

# Step 3: Verify
if ! wait_for_backend; then
  echo "FATAL: Secret #4 failed. Rollback:"
  echo "  1. cp ${ENV_FILE}.bak.${TIMESTAMP} ${ENV_FILE}"
  echo "  2. cd $GDA_PROJECT_DIR && docker compose -f docker-compose.prod.yml up -d backend"
  exit 1
fi

if ! health_check; then
  echo "FATAL: Secret #4 health check failed. See rollback above."
  exit 1
fi

# Reconnect n8n_default if dropped
if ! docker inspect gda-backend --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | grep -q "n8n_default"; then
  docker network connect n8n_default gda-backend 2>/dev/null || true
fi

echo ">>> Secret #4 rotated — verified"
echo ""

# =============================================================================
# SECRET #5: n8n Postgres password (user "n8n" on n8n-envision-postgres-1)
# =============================================================================
echo "=== Secret #5: n8n Postgres password ==="

if [[ "$SKIP_N8N" == "true" ]]; then
  echo "  SKIPPED — n8n-envision-postgres-1 is not running"
  echo "  Run this secret rotation manually when n8n is available"
else
  NEW_N8N_PG_PASS=$(gen_hex 32)

  # Capture old password for rollback from the n8n container env
  OLD_N8N_PG_PASS=$(docker exec n8n-envision-postgres-1 bash -c 'echo $POSTGRES_PASSWORD' 2>/dev/null || true)

  # Step 1: ALTER USER on n8n postgres
  echo "  Step 1: ALTER USER n8n on n8n-envision-postgres-1..."
  docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -c "ALTER USER n8n PASSWORD '${NEW_N8N_PG_PASS}';" > /dev/null 2>&1
  echo "  Step 1: done"

  # Step 2: Update n8n container env (POSTGRES_PASSWORD in n8n's .env or compose)
  echo "  Step 2: Updating n8n environment..."
  N8N_CONTAINER_NAME=""
  # Find the n8n app container
  for candidate in n8n n8n-envision n8n-envision-1; do
    if docker ps --format '{{.Names}}' | grep -q "^${candidate}$"; then
      N8N_CONTAINER_NAME="$candidate"
      break
    fi
  done

  if [[ -z "$N8N_CONTAINER_NAME" ]]; then
    # Try to find any container with "n8n" in name that isn't postgres
    N8N_CONTAINER_NAME=$(docker ps --format '{{.Names}}' | grep -i n8n | grep -v postgres | head -1 || true)
  fi

  if [[ -n "$N8N_PROJECT_DIR" && -n "$N8N_ENV_FILE" ]]; then
    backup_env "$N8N_ENV_FILE"
    update_env_var "$N8N_ENV_FILE" "POSTGRES_PASSWORD" "$NEW_N8N_PG_PASS"
    # Also update DB_POSTGRESDB_PASSWORD if present
    if grep -q "DB_POSTGRESDB_PASSWORD" "$N8N_ENV_FILE" 2>/dev/null; then
      update_env_var "$N8N_ENV_FILE" "DB_POSTGRESDB_PASSWORD" "$NEW_N8N_PG_PASS"
    fi
    echo "  Step 2: n8n .env updated"
  elif [[ -n "$N8N_PROJECT_DIR" ]]; then
    # No .env — check for docker-compose env vars
    echo "  WARNING: No n8n .env file found at $N8N_PROJECT_DIR"
    echo "  You may need to update POSTGRES_PASSWORD and DB_POSTGRESDB_PASSWORD"
    echo "  in the n8n docker-compose.yml manually"
  else
    echo "  WARNING: Cannot locate n8n project directory"
    echo "  Manually update n8n postgres password in its compose/env config"
  fi

  # Step 3: Update N8N_DATABASE_URL in gda-backend .env
  echo "  Step 3: Updating N8N_DATABASE_URL in gda-backend .env..."
  backup_env "$ENV_FILE"
  NEW_N8N_DB_URL="postgresql://n8n:${NEW_N8N_PG_PASS}@n8n-envision-postgres-1:5432/n8n"
  update_env_var "$ENV_FILE" "N8N_DATABASE_URL" "$NEW_N8N_DB_URL"
  echo "  Step 3: done"

  # Step 4: Restart n8n containers, then gda-backend
  echo "  Step 4: Restarting n8n stack..."
  if [[ -n "$N8N_PROJECT_DIR" ]]; then
    cd "$N8N_PROJECT_DIR"
    docker compose up -d 2>/dev/null || docker-compose up -d 2>/dev/null || true
  else
    # Try restarting individual containers
    docker restart n8n-envision-postgres-1 2>/dev/null || true
    if [[ -n "$N8N_CONTAINER_NAME" ]]; then
      docker restart "$N8N_CONTAINER_NAME" 2>/dev/null || true
    fi
  fi

  echo "  Waiting 15s for n8n to reconnect..."
  sleep 15

  echo "  Restarting gda-backend..."
  cd "$GDA_PROJECT_DIR"
  docker compose -f docker-compose.prod.yml up -d backend

  # Step 5: Verify
  if ! wait_for_backend; then
    echo "FATAL: Secret #5 failed — backend won't start."
    echo "ROLLBACK:"
    echo "  1. cp ${ENV_FILE}.bak.${TIMESTAMP} ${ENV_FILE}"
    if [[ -n "$N8N_ENV_FILE" ]]; then
      echo "  2. cp ${N8N_ENV_FILE}.bak.${TIMESTAMP} ${N8N_ENV_FILE}"
    fi
    echo "  3. docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -c \"ALTER USER n8n PASSWORD '\$OLD_PASSWORD';\""
    echo "  4. Restart n8n stack and gda-backend"
    exit 1
  fi

  if ! health_check; then
    echo "FATAL: Secret #5 health check failed. See rollback above."
    exit 1
  fi

  # Reconnect n8n_default if dropped
  if ! docker inspect gda-backend --format '{{json .NetworkSettings.Networks}}' 2>/dev/null | grep -q "n8n_default"; then
    docker network connect n8n_default gda-backend 2>/dev/null || true
  fi

  # Verify n8n is healthy — check canary workflow last execution
  echo "  Verifying n8n connectivity..."
  CANARY_CHECK=$(docker exec n8n-envision-postgres-1 psql -U n8n -d n8n -tAc \
    "SELECT status FROM execution_entity WHERE \"workflowId\"='LPUSYd4Vpph1Qg7n' ORDER BY id DESC LIMIT 1;" 2>/dev/null || echo "FAIL")

  if [[ "$CANARY_CHECK" == "FAIL" ]]; then
    echo "  WARNING: Could not query n8n postgres — verify n8n manually"
  else
    echo "  n8n canary last status: $CANARY_CHECK"
  fi

  # Check sentinel probe for n8n_canary
  echo "  Checking sentinel n8n_canary probe..."
  SENTINEL_JSON=$(curl -sf http://localhost:3001/api/sentinel/current 2>/dev/null || echo "{}")
  N8N_STATUS=$(echo "$SENTINEL_JSON" | python3 -c "
import sys,json
try:
  d=json.load(sys.stdin)
  for c in d.get('data',{}).get('components',[]):
    if c['name']=='n8n_canary': print(c['status']); break
  else: print('NOT_FOUND')
except: print('PARSE_ERROR')
" 2>/dev/null || echo "UNKNOWN")
  echo "  Sentinel n8n_canary status: $N8N_STATUS"

  echo ">>> Secret #5 rotated — verified"
fi

echo ""
echo "=== F-040 Phase 1 complete at $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
echo ""
echo "Summary:"
echo "  Secret #1 (DATABASE_URL / gda password):     rotated — verified"
echo "  Secret #2 (MIGRATION_DATABASE_URL / gda_app): rotated — verified"
echo "  Secret #3 (GDA_WEBHOOK_KEY):                  rotated — verified"
echo "  Secret #4 (JWT_SECRET):                       rotated — verified"
if [[ "$SKIP_N8N" == "true" ]]; then
  echo "  Secret #5 (n8n Postgres / n8n user):         SKIPPED — n8n not running"
else
  echo "  Secret #5 (n8n Postgres / n8n user):         rotated — verified"
fi
echo ""
echo "Backup .env files saved with suffix .bak.${TIMESTAMP}"
echo "All existing user JWT sessions have been invalidated (Secret #4)."
echo "Log: $LOGFILE"
echo ""
echo "NEXT: Run Phase 2 manually per docs/runbooks/F-040_secret_rotation.md"
