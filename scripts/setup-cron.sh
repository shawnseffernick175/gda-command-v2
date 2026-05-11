#!/usr/bin/env bash
# GDA Command v2 — Install backup cron job on the host
# Usage: ./scripts/setup-cron.sh
#
# Installs a cron job that runs pg_dump daily at 2:00 AM via docker exec.
# The backup is stored in the gda-backups Docker volume.

set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-gda-v2-postgres}"
PG_USER="${POSTGRES_USER:-gda}"
PG_DB="${POSTGRES_DB:-gda_command}"
BACKUP_CONTAINER="${BACKUP_CONTAINER:-gda-v2-backend}"

# Cron expression: daily at 2:00 AM server time
CRON_SCHEDULE="0 2 * * *"

# The backup command runs pg_dump inside the postgres container,
# pipes it through gzip, and writes to the backend container's backup volume
CRON_CMD="${CRON_SCHEDULE} docker exec ${CONTAINER} pg_dump -U ${PG_USER} -d ${PG_DB} --no-owner --no-privileges --clean --if-exists 2>/dev/null | gzip > /tmp/gda_backup_\$(date +\\%Y\\%m\\%d_\\%H\\%M\\%S).sql.gz && docker cp /tmp/gda_backup_*.sql.gz ${BACKUP_CONTAINER}:/var/backups/gda/daily/ && rm -f /tmp/gda_backup_*.sql.gz"

# Weekly rotation: Sundays at 3:00 AM — copy latest daily to weekly
WEEKLY_CMD="0 3 * * 0 docker exec ${BACKUP_CONTAINER} sh -c 'LATEST=\$(ls -1t /var/backups/gda/daily/*.sql.gz 2>/dev/null | head -1); [ -n \"\$LATEST\" ] && cp \"\$LATEST\" /var/backups/gda/weekly/'"

# Daily rotation cleanup: keep last 7 daily, 4 weekly
CLEANUP_CMD="30 3 * * * docker exec ${BACKUP_CONTAINER} sh -c 'cd /var/backups/gda/daily && ls -1t *.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f; cd /var/backups/gda/weekly && ls -1t *.sql.gz 2>/dev/null | tail -n +5 | xargs -r rm -f'"

echo "[setup-cron] Installing GDA backup cron jobs..."

# Remove existing GDA backup cron entries, then add new ones
(crontab -l 2>/dev/null | grep -v "gda_backup" | grep -v "gda-v2-backend.*backup" ; echo "${CRON_CMD}" ; echo "${WEEKLY_CMD}" ; echo "${CLEANUP_CMD}") | crontab -

echo "[setup-cron] Cron jobs installed:"
crontab -l | grep -E "(gda_backup|gda-v2-backend.*backup)"

echo ""
echo "[setup-cron] Done. Backups will run daily at 2:00 AM."
echo "[setup-cron] Weekly backups promoted on Sundays at 3:00 AM."
echo "[setup-cron] Cleanup runs daily at 3:30 AM (keeps 7 daily + 4 weekly)."
