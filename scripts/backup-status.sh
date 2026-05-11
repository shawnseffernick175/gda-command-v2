#!/usr/bin/env bash
# GDA Command v2 — Backup status report
# Usage: ./scripts/backup-status.sh [backup_dir]

set -euo pipefail

BACKUP_DIR="${1:-/var/backups/gda}"
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"

echo "=== GDA Command v2 Backup Status ==="
echo ""

echo "Daily backups (${DAILY_DIR}):"
if ls "${DAILY_DIR}"/gda_command_*.sql.gz 1>/dev/null 2>&1; then
  ls -lh "${DAILY_DIR}"/gda_command_*.sql.gz | awk '{print "  " $NF " (" $5 ", " $6 " " $7 " " $8 ")"}'
  DAILY_COUNT=$(ls -1 "${DAILY_DIR}"/gda_command_*.sql.gz | wc -l)
  echo "  Total: ${DAILY_COUNT} backup(s)"
else
  echo "  No daily backups found"
fi

echo ""
echo "Weekly backups (${WEEKLY_DIR}):"
if ls "${WEEKLY_DIR}"/gda_command_*.sql.gz 1>/dev/null 2>&1; then
  ls -lh "${WEEKLY_DIR}"/gda_command_*.sql.gz | awk '{print "  " $NF " (" $5 ", " $6 " " $7 " " $8 ")"}'
  WEEKLY_COUNT=$(ls -1 "${WEEKLY_DIR}"/gda_command_*.sql.gz | wc -l)
  echo "  Total: ${WEEKLY_COUNT} backup(s)"
else
  echo "  No weekly backups found"
fi

echo ""
echo "Disk usage:"
du -sh "${BACKUP_DIR}" 2>/dev/null || echo "  Backup directory not found"

echo ""
echo "Cron schedule:"
crontab -l 2>/dev/null | grep -i backup || echo "  No backup cron jobs found"
