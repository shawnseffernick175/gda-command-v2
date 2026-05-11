#!/usr/bin/env bash
# GDA Command v2 — PostgreSQL backup script
# Usage: ./scripts/backup.sh [backup_dir]
#
# Creates a compressed pg_dump of the gda_command database.
# Rotates old backups: keeps last 7 daily + last 4 weekly.
#
# Environment variables (with defaults):
#   POSTGRES_CONTAINER  — Docker container name (default: gda-v2-postgres)
#   POSTGRES_USER       — Database user (default: gda)
#   POSTGRES_DB         — Database name (default: gda_command)
#   BACKUP_RETAIN_DAILY — Number of daily backups to keep (default: 7)
#   BACKUP_RETAIN_WEEKLY — Number of weekly backups to keep (default: 4)

set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-gda-v2-postgres}"
PG_USER="${POSTGRES_USER:-gda}"
PG_DB="${POSTGRES_DB:-gda_command}"
BACKUP_DIR="${1:-/var/backups/gda}"
RETAIN_DAILY="${BACKUP_RETAIN_DAILY:-7}"
RETAIN_WEEKLY="${BACKUP_RETAIN_WEEKLY:-4}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=Monday, 7=Sunday
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
FILENAME="gda_command_${TIMESTAMP}.sql.gz"

mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}"

echo "[backup] Starting backup at $(date -Iseconds)"
echo "[backup] Container: ${CONTAINER}, DB: ${PG_DB}, User: ${PG_USER}"

# Verify container is running
if ! docker inspect "${CONTAINER}" --format '{{.State.Running}}' 2>/dev/null | grep -q true; then
  echo "[backup] ERROR: Container '${CONTAINER}' is not running" >&2
  exit 1
fi

# Run pg_dump inside the container, pipe compressed output to host
docker exec "${CONTAINER}" pg_dump -U "${PG_USER}" -d "${PG_DB}" \
  --no-owner --no-privileges --clean --if-exists \
  | gzip > "${DAILY_DIR}/${FILENAME}"

BACKUP_SIZE=$(du -h "${DAILY_DIR}/${FILENAME}" | cut -f1)
echo "[backup] Daily backup created: ${DAILY_DIR}/${FILENAME} (${BACKUP_SIZE})"

# Promote Sunday backups to weekly
if [ "${DAY_OF_WEEK}" = "7" ]; then
  cp "${DAILY_DIR}/${FILENAME}" "${WEEKLY_DIR}/${FILENAME}"
  echo "[backup] Weekly backup created: ${WEEKLY_DIR}/${FILENAME}"
fi

# Rotate daily backups — keep last N
DAILY_COUNT=$(ls -1 "${DAILY_DIR}"/gda_command_*.sql.gz 2>/dev/null | wc -l)
if [ "${DAILY_COUNT}" -gt "${RETAIN_DAILY}" ]; then
  REMOVE_COUNT=$((DAILY_COUNT - RETAIN_DAILY))
  ls -1t "${DAILY_DIR}"/gda_command_*.sql.gz | tail -n "${REMOVE_COUNT}" | xargs rm -f
  echo "[backup] Rotated ${REMOVE_COUNT} old daily backup(s), keeping ${RETAIN_DAILY}"
fi

# Rotate weekly backups — keep last N
WEEKLY_COUNT=$(ls -1 "${WEEKLY_DIR}"/gda_command_*.sql.gz 2>/dev/null | wc -l)
if [ "${WEEKLY_COUNT}" -gt "${RETAIN_WEEKLY}" ]; then
  REMOVE_COUNT=$((WEEKLY_COUNT - RETAIN_WEEKLY))
  ls -1t "${WEEKLY_DIR}"/gda_command_*.sql.gz | tail -n "${REMOVE_COUNT}" | xargs rm -f
  echo "[backup] Rotated ${REMOVE_COUNT} old weekly backup(s), keeping ${RETAIN_WEEKLY}"
fi

echo "[backup] Complete at $(date -Iseconds)"
