# F-036: Staging Database Environment

**Date:** 2026-05-22
**Tracking issue:** [#289](https://github.com/shawnseffernick175/gda-command-v2/issues/289)
**Purpose:** Rehearsal target for F-026 Step 3 (high-risk data migration with FK ordering, type coercions, pgvector handling).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  VPS (187.77.206.105)                                               │
│                                                                     │
│  ┌──────────────────────┐      ┌──────────────────────────────┐    │
│  │ n8n-envision-        │      │ gda-postgres                 │    │
│  │ postgres-1           │      │ (gda_command DB)             │    │
│  │ (n8n DB — 156 tables)│      │ (86 tables, migration-       │    │
│  │ Port: 5432 (local)   │      │  tracked)                    │    │
│  └─────────┬────────────┘      └──────────────┬───────────────┘    │
│            │                                   │                    │
│            │  pg_dump --no-owner               │  pg_dump --no-owner│
│            │  --no-privileges                  │  --no-privileges   │
│            │  --format=custom                  │  --format=custom   │
│            ▼                                   ▼                    │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │ gda-postgres-staging                                      │      │
│  │ Container: PostgreSQL 16.14, pgvector v0.8.2              │      │
│  │ Resources: 256MB RAM, 0.5 CPU (50% of prod)              │      │
│  │ Port: 127.0.0.1:5433 → 5432 (localhost only)             │      │
│  │ Volume: gda-pgdata-staging                                │      │
│  │ Networks: n8n_default, gda-command-v2_gda                 │      │
│  │                                                            │      │
│  │  ┌─────────────────┐  ┌──────────────────────────┐       │      │
│  │  │ n8n_staging      │  │ gda_command_staging       │       │      │
│  │  │ 156 tables       │  │ 86 tables                 │       │      │
│  │  │ (logical clone)  │  │ (logical clone)            │       │      │
│  │  └─────────────────┘  └──────────────────────────┘       │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Nightly refresh: 3 AM EST via cron                                │
│  /root/refresh-staging.sh                                          │
│  Log: /var/log/gda-staging-refresh.log                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Refresh Flow

```
Nightly 3 AM EST (cron)
  └→ /root/refresh-staging.sh
       ├── 1. pg_dump prod n8n DB → /tmp/staging-refresh-dumps/
       ├── 2. pg_dump prod gda_command → /tmp/staging-refresh-dumps/
       ├── 3. Terminate staging connections
       ├── 4. DROP + CREATE staging DBs (n8n_staging, gda_command_staging)
       ├── 5. CREATE EXTENSION vector (both DBs)
       ├── 6. pg_restore n8n_staging
       ├── 7. pg_restore gda_command_staging
       ├── 8. Verify table count parity (prod vs staging)
       ├── 9. Spot-check key tables (gda_opportunity_tracker, gda_embeddings, sam_opportunities)
       └── 10. Log result to /var/log/gda-staging-refresh.log
```

---

## Manual Refresh

```bash
# Run from VPS as root
/root/refresh-staging.sh

# Monitor progress
tail -f /var/log/gda-staging-refresh.log
```

The script is idempotent — safe to run at any time. On failure, the previous staging snapshot is preserved.

---

## Connecting to Staging

### From VPS (Docker network)

```bash
# Direct connection via container name
docker exec gda-postgres-staging psql -U gda_staging -d gda_command_staging
docker exec gda-postgres-staging psql -U gda_staging -d n8n_staging
```

### From VPS (localhost)

```bash
psql -h 127.0.0.1 -p 5433 -U gda_staging -d gda_command_staging
# Password: staging_only_not_prod
```

### From Devin / CI (SSH tunnel)

```bash
# Establish SSH tunnel
ssh -f -N -L 15432:127.0.0.1:5433 root@187.77.206.105

# Connect via tunnel
psql -h localhost -p 15432 -U gda_staging -d gda_command_staging

# Connection string for applications
DATABASE_URL=postgresql://gda_staging:staging_only_not_prod@localhost:15432/gda_command_staging
```

### From GitHub Actions CI

The `Migration Smoke Test (Staging)` job automatically establishes an SSH tunnel using `VPS_SSH_KEY` and `VPS_HOST` secrets. If secrets are not configured, the job reports an environmental warning and exits without failing the PR.

---

## Backup Checkpoint

Before any production migration, run:

```bash
/root/backup-before-migration.sh <db_name>
```

Supported databases: `gda_command`, `n8n`, `gda_command_staging`, `n8n_staging`

Backups are stored in `/root/backups/<db_name>_<ISO_timestamp>.dump` and auto-pruned after 30 days.

### Recovery from backup

```bash
# Restore a specific backup
docker exec gda-postgres pg_restore -U gda -d gda_command --clean --if-exists /path/to/backup.dump
```

---

## Failure Modes and Recovery

### Refresh script fails mid-execution

**Behavior:** Previous staging snapshot is preserved. Error logged to `/var/log/gda-staging-refresh.log`.

**Recovery:** Fix the root cause, then re-run `/root/refresh-staging.sh`.

### Staging container stops

**Diagnosis:** `docker ps | grep staging`

**Recovery:**
```bash
docker start gda-postgres-staging
```

### Staging DB corrupted / needs full reset

```bash
docker stop gda-postgres-staging
docker rm gda-postgres-staging
docker volume rm gda-pgdata-staging

# Recreate
docker run -d --name gda-postgres-staging --restart unless-stopped \
  -e POSTGRES_USER=gda_staging \
  -e POSTGRES_PASSWORD=staging_only_not_prod \
  -e POSTGRES_DB=gda_command_staging \
  --memory=256m --cpus=0.5 \
  --network n8n_default \
  -p 127.0.0.1:5433:5432 \
  -v gda-pgdata-staging:/var/lib/postgresql/data \
  pgvector/pgvector:pg16

docker network connect gda-command-v2_gda gda-postgres-staging
sleep 5
/root/refresh-staging.sh
```

### CI staging job fails — environmental vs logical

| Error type | Indicator | Action |
|------------|-----------|--------|
| Environmental | "ENVIRONMENTAL FAILURE" in output, SSH tunnel failure | Does NOT block PR merge. Fix VPS_SSH_KEY/VPS_HOST secrets |
| Logical | Migration error, constraint violation, type coercion failure | BLOCKS PR merge. Fix the migration before merging |

### Disk space issues

```bash
# Check VPS disk
df -h /

# If low on space, prune old backups
find /root/backups -name "*.dump" -mtime +7 -delete

# Check staging volume size
docker system df -v | grep pgdata-staging
```

---

## Configuration Reference

| Setting | Value |
|---------|-------|
| Container | `gda-postgres-staging` |
| Image | `pgvector/pgvector:pg16` |
| PostgreSQL | 16.14 |
| pgvector | v0.8.2 |
| Staging user | `gda_staging` |
| Staging password | `staging_only_not_prod` |
| n8n staging DB | `n8n_staging` |
| gda staging DB | `gda_command_staging` |
| Port (VPS localhost) | `127.0.0.1:5433` |
| Memory limit | 256MB |
| CPU limit | 0.5 |
| Volume | `gda-pgdata-staging` |
| Networks | `n8n_default`, `gda-command-v2_gda` |
| Refresh schedule | 3 AM EST (nightly, via cron) |
| Refresh script | `/root/refresh-staging.sh` |
| Backup script | `/root/backup-before-migration.sh` |
| Backup directory | `/root/backups/` |
| Backup retention | 30 days |
| Log file | `/var/log/gda-staging-refresh.log` |
