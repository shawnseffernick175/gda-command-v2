# archive/pre-v3-scripts

Historical V2-era operations and migration scripts moved out of the live
`scripts/` tree per **F-254** (executing the F-253 orphan-code audit).

## What is here

| Original path | Purpose |
|---|---|
| `scripts/backup.sh` | V2 database backup |
| `scripts/backup-status.sh` | V2 backup-status check |
| `scripts/restore.sh` | V2 database restore |
| `scripts/setup-cron.sh` | V2 cron job installer |
| `scripts/f026/step3-data-migration.sh` | F-026 data migration (step 3) |
| `scripts/f026/step3b-data-migration.sh` | F-026 data migration (step 3b) |
| `scripts/f026/step4-credential-cutover.sh` | F-026 credential cutover |
| `scripts/f026/step4b/migrate-orphans.sh` | F-026 orphan migration |
| `scripts/f040/rotate-phase1.sh` | F-040 credential rotation phase 1 |

## Status

- **Not loaded** by any CI workflow, `docker-compose`, or backend service.
- Kept for audit trail and historical reference.
- Safe to delete in the future if no longer useful.

## Audit source

See [`docs/audits/F-253-orphan-code-report.md`](../../docs/audits/F-253-orphan-code-report.md)
for the full audit that produced these verdicts.
