#!/usr/bin/env bash
# bootstrap-gda-runtime.sh — One-shot creation of the gda_runtime / gda_staging_rt role.
# Run ON the VPS (or via SSH: ssh root@VPS 'bash /root/gda-command-v2/scripts/bootstrap-gda-runtime.sh prod').
#
# This script:
#   1. Runs create-gda-runtime.sql as the bootstrap superuser
#   2. Generates a 32-char password
#   3. Sets the password via ALTER ROLE
#   4. Writes the password to /tmp/gda-runtime-pw-shawn-readonly (chmod 400)
#
# After running, Shawn must:
#   - Copy password into n8n credential HwronxMmGY5XDGEt
#   - Copy password into GitHub Actions secret (if applicable)
#   - Then run scripts/rotate-gda-runtime-credential.sh prod to wire up DATABASE_URL + restart
#     (staging does NOT need rotate — there is no staging backend service)
#
# Usage: bash scripts/bootstrap-gda-runtime.sh [prod|staging] [--dry-run] [--force]
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
    CONTAINER="gda-postgres"
    DB_USER="gda"
    DB_NAME="gda"
    RUNTIME_ROLE="gda_runtime"
    ;;
  staging)
    CONTAINER="gda-postgres-staging"
    DB_USER="gda_staging"
    DB_NAME="gda_command_staging"
    RUNTIME_ROLE="gda_staging_rt"
    ;;
  *)
    echo "Usage: $0 [prod|staging] [--dry-run] [--force]" >&2
    exit 1
    ;;
esac

HANDOFF="/tmp/gda-runtime-pw-shawn-readonly"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/create-gda-runtime.sql"

echo "=== bootstrap-gda-runtime.sh ==="
echo "env=${ENV}  container=${CONTAINER}  db=${DB_NAME}  role=${RUNTIME_ROLE}  dry_run=${DRY_RUN}  force=${FORCE}"

if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: ${SQL_FILE} not found" >&2
  exit 1
fi

# ── Dry-run mode ───────────────────────────────────────────────────────────
if $DRY_RUN; then
  echo ""
  echo "=== DRY RUN — no changes will be made ==="
  echo ""
  echo "Would run:"
  echo "  1. docker exec -i ${CONTAINER} psql -U ${DB_USER} -d ${DB_NAME} < ${SQL_FILE}"
  echo "  2. Generate 32-char password"
  echo "  3. ALTER ROLE ${RUNTIME_ROLE} PASSWORD '***'"
  echo "  4. Write password to ${HANDOFF} (chmod 400)"
  echo "  5. Verify ${RUNTIME_ROLE} can authenticate"
  echo ""
  echo "Role exists check:"
  if docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A \
      -c "SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_ROLE}'" 2>/dev/null | grep -q '1'; then
    echo "  ${RUNTIME_ROLE} already exists (bootstrap SQL is idempotent)"
  else
    echo "  ${RUNTIME_ROLE} does not exist yet (will be created)"
  fi
  echo ""
  echo "=== DRY RUN complete ==="
  exit 0
fi

# ── Confirmation prompt (unless --force) ───────────────────────────────────
if ! $FORCE; then
  echo ""
  echo "This will create/update the runtime role ${RUNTIME_ROLE} in ${CONTAINER}."
  echo "  - Run ${SQL_FILE} as ${DB_USER}"
  echo "  - Generate and set a new password"
  echo "  - Write password to ${HANDOFF}"
  echo ""
  read -rp "Proceed? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# 1. Run creation SQL as bootstrap superuser
echo "--- creating runtime role ---"
docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$SQL_FILE"

# 2. Generate 32-char alphanumeric password
echo "--- generating password ---"
NEW_PW=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)

# 3. Set password via ALTER ROLE
docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "ALTER ROLE ${RUNTIME_ROLE} PASSWORD '${NEW_PW}'"
echo "--- password set for ${RUNTIME_ROLE} ---"

# 4. Write handoff file
echo -n "$NEW_PW" > "$HANDOFF"
chmod 400 "$HANDOFF"

# 5. Verify role can authenticate
if docker exec -e PGPASSWORD="$NEW_PW" "$CONTAINER" \
    psql -U "$RUNTIME_ROLE" -d "$DB_NAME" -t -A -c "SELECT 'auth_ok'" 2>/dev/null | grep -q 'auth_ok'; then
  echo "--- verified: ${RUNTIME_ROLE} authenticates successfully ---"
else
  echo "WARNING: authentication test failed for ${RUNTIME_ROLE}" >&2
fi

echo ""
echo "=== Bootstrap complete ==="
echo "Password written to: ${HANDOFF}"
echo ""
echo "Next steps:"
echo "  1. Copy password to n8n credential HwronxMmGY5XDGEt:"
echo "     cat ${HANDOFF}"
if [ "$ENV" = "prod" ]; then
  echo "  2. Run credential rollout to wire DATABASE_URL + restart backend:"
  echo "     bash ${SCRIPT_DIR}/rotate-gda-runtime-credential.sh prod"
else
  echo "  2. (Staging) No rotate needed — there is no staging backend service."
  echo "     Staging password is used only for CI migration testing via GitHub Actions secret."
  echo "     Update secret: ssh root@VPS 'cat ${HANDOFF}' | gh secret set STAGING_DB_PASSWORD --repo shawnseffernick175/gda-command-v2"
fi
echo "  3. Delete handoff file after all secrets are updated:"
echo "     rm ${HANDOFF}"
