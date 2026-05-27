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
#   - Then run scripts/rotate-gda-runtime-credential.sh to wire up DATABASE_URL + restart
set -euo pipefail

ENV="${1:-prod}"

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
    echo "Usage: $0 [prod|staging]" >&2
    exit 1
    ;;
esac

HANDOFF="/tmp/gda-runtime-pw-shawn-readonly"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="${SCRIPT_DIR}/create-gda-runtime.sql"

echo "=== bootstrap-gda-runtime.sh ==="
echo "env=${ENV}  container=${CONTAINER}  db=${DB_NAME}  role=${RUNTIME_ROLE}"

if [ ! -f "$SQL_FILE" ]; then
  echo "ERROR: ${SQL_FILE} not found" >&2
  exit 1
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
echo "  2. Run credential rollout to wire DATABASE_URL + restart backend:"
echo "     bash ${SCRIPT_DIR}/rotate-gda-runtime-credential.sh ${ENV}"
echo "  3. Delete handoff file after all secrets are updated:"
echo "     rm ${HANDOFF}"
