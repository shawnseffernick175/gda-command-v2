# F-036a Follow-up: Staging Postgres Password Rotation

**Date:** 2026-05-26
**Related PR:** #334 (F-036a: Move staging Postgres password to GitHub Actions secret)

## Background

PR #334 removed the hardcoded staging Postgres password (`staging_only_not_prod`)
from all tracked files and migrated CI consumers to `${{ secrets.STAGING_DB_PASSWORD }}`.
However, the old password remained in git history across 22+ commits, making rotation
necessary.

## Rotation Record

| Item | Details |
|------|---------|
| **Database user** | `gda_staging` |
| **Database names** | `gda_command_staging`, `n8n_staging` |
| **Container** | `gda-postgres-staging` (port 5433) |
| **Old password** | `staging_only_not_prod` (compromised via git history) |
| **New password** | 32-char random alphanumeric (not in any tracked file) |
| **Rotation method** | `ALTER USER gda_staging PASSWORD '...'` in running container |

## Consumers Updated

| Consumer | Location | Status |
|----------|----------|--------|
| Running Postgres container | `gda-postgres-staging` | ✅ `ALTER USER` applied |
| VPS `.env` | `/root/gda-command-v2/.env` → `STAGING_POSTGRES_PASSWORD` | ✅ Updated |
| GitHub Actions secret | `STAGING_DB_PASSWORD` | ⏳ User must update via `gh secret set` |
| `docker-compose.prod.yml` | `${STAGING_POSTGRES_PASSWORD:?...}` (env var ref, no literal) | ✅ No change needed |
| CI workflow | `${{ secrets.STAGING_DB_PASSWORD }}` (secret ref, no literal) | ✅ No change needed |

## Verification

1. **New password connects** via remote auth (port 5433, scram-sha-256): ✅
2. **Old password rejected** via remote auth: ✅ (`FATAL: password authentication failed`)
3. **Container local auth** uses `trust` (pg_hba.conf) — password not checked for local connections inside container

## Handoff

New password written to `/tmp/staging-pw-shawn-readonly` on VPS (root-only, mode 400).
User should:
1. Copy value to GitHub Actions secret:
   ```bash
   ssh root@100.100.80.78 'cat /tmp/staging-pw-shawn-readonly' | gh secret set STAGING_DB_PASSWORD --repo shawnseffernick175/gda-command-v2
   ```
2. Delete the handoff file after copying:
   ```bash
   ssh root@100.100.80.78 'rm /tmp/staging-pw-shawn-readonly'
   ```

## Risk Notes

- The old password `staging_only_not_prod` is in 22+ historical commits. Git history
  was NOT rewritten (per F-036a scope). Anyone with repo access can find the old value,
  but it no longer authenticates to the staging database.
- `docker-compose.prod.yml` will use the new password from `.env` on next container
  recreation. The running container already has the new password via `ALTER USER`.
