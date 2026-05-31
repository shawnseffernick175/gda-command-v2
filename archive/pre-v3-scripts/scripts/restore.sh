#!/usr/bin/env bash
# GDA Command v2 — PostgreSQL restore script
# Usage: ./scripts/restore.sh <backup_file.sql.gz>
#
# Restores a compressed pg_dump backup into the running PostgreSQL container.
# WARNING: This drops and recreates the database. All current data will be lost.
#
# Environment variables (with defaults):
#   POSTGRES_CONTAINER  — Docker container name (default: gda-v2-postgres)
#   POSTGRES_USER       — Database user (default: gda)
#   POSTGRES_DB         — Database name (default: gda)

set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-gda-v2-postgres}"
PG_USER="${POSTGRES_USER:-gda}"
PG_DB="${POSTGRES_DB:-gda}"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_file.sql.gz>" >&2
  echo "" >&2
  echo "Available backups:" >&2
  ls -lh /var/backups/gda/daily/*.sql.gz /var/backups/gda/weekly/*.sql.gz 2>/dev/null || echo "  No backups found" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[restore] ERROR: Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

# Verify container is running
if ! docker inspect "${CONTAINER}" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
  echo "[restore] ERROR: Container '${CONTAINER}' is not running" >&2
  exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[restore] Restoring from: ${BACKUP_FILE} (${BACKUP_SIZE})"
echo "[restore] Target: ${CONTAINER} / ${PG_DB}"
echo ""
echo "WARNING: This will DROP and recreate the '${PG_DB}' database."
echo "All current data will be replaced with the backup contents."
echo ""

# Prompt for confirmation (skip if stdin is not a terminal)
if [ -t 0 ]; then
  read -rp "Continue? [y/N] " CONFIRM
  if [[ ! "${CONFIRM}" =~ ^[Yy]$ ]]; then
    echo "[restore] Aborted."
    exit 0
  fi
fi

echo "[restore] Starting restore at $(date -Iseconds)"

# Decompress and pipe into psql
gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER}" \
  psql -U "${PG_USER}" -d "${PG_DB}" --single-transaction -q

echo "[restore] Restore complete at $(date -Iseconds)"
echo "[restore] Verifying table counts..."

docker exec "${CONTAINER}" psql -U "${PG_USER}" -d "${PG_DB}" -c \
  "SELECT schemaname, tablename, n_live_tup AS row_count
   FROM pg_stat_user_tables
   ORDER BY tablename;"
