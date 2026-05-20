# GDA Command — Deployment Guide

## Canonical Deploy Path

All production deployments follow this path. No exceptions.

```
1. PR merged to main (CI gates: Build, Test, Migration Smoke, Dependency Audit)
2. SSH to production VPS
3. cd /opt/gda-command-v2
4. git pull origin main
5. export DEPLOY_COMMIT_SHA=$(git rev-parse HEAD)
6. docker compose -f docker-compose.prod.yml up -d --build
7. Verify: docker logs gda-backend --tail 50
```

Migrations run automatically on container startup via `docker-entrypoint.sh`.

## Role Separation (F-019)

Production Postgres has three roles:

| Role | Purpose | Privileges | Used by |
|------|---------|------------|---------|
| `gda` | Application runtime | SELECT, INSERT, UPDATE, DELETE | `DATABASE_URL` |
| `gda_migrator` | Migration runner | Full DDL + DML | `MIGRATION_DATABASE_URL` |
| `gda_drift_reader` | Weekly drift check | SELECT on `schema_migrations` only | `DRIFT_DATABASE_URL` (GitHub Actions secret) |

The `gda` role **cannot** CREATE TABLE, ALTER TABLE, or DROP TABLE. This prevents
any SSH session using application credentials from applying migrations outside the
canonical deploy path.

## Manifest Hash Verification

Every migration `.sql` file has a SHA-256 hash recorded in `migration-manifest.json`,
generated at Docker image build time. The migration runner verifies each file's hash
before applying. This prevents content tampering between merge and deploy.

## Provenance

Every migration applied after F-019 records:
- `applied_by`: `current_user` from Postgres (unforgeable)
- `commit_sha`: baked into the Docker image via `DEPLOY_COMMIT_SHA` build arg
- `file_sha256`: SHA-256 of the `.sql` file content as applied

## Break-Glass Procedures

### Manifest check bypass

If the manifest is stale or mismatched (hash verification fails on a legitimate migration):

```bash
# 1. Immediate fix (2am scenario)
# Add to .env or pass directly:
MIGRATION_SKIP_MANIFEST_CHECK=true docker compose -f docker-compose.prod.yml up -d --build

# 2. Proper fix (next morning)
# Regenerate manifest and rebuild:
npx tsx packages/backend/src/db/generate-migration-manifest.ts
git add packages/backend/src/db/migrations/migration-manifest.json
git commit -m "fix: regenerate migration manifest"
git push origin main
# Then redeploy normally (without the skip flag)
```

### Role separation bypass

If `MIGRATION_DATABASE_URL` is unavailable or the `gda_migrator` role is locked out:

```bash
# Requires BOTH factors:
# 1. Environment variable
export MIGRATION_USE_APP_ROLE_FOR_DDL=true

# 2. Root-owned file (cannot be created by the app user)
sudo touch /etc/gda/break-glass-ddl

# Then restart the container
docker compose -f docker-compose.prod.yml up -d

# After the emergency, remove the break-glass file:
sudo rm /etc/gda/break-glass-ddl
```

### Nuclear option (manual SQL)

If the migration runner itself is broken:

```bash
# 1. Connect directly with gda_migrator credentials
psql "postgresql://gda_migrator:PASSWORD@localhost:5432/gda_command"

# 2. Run the migration SQL manually
\i /path/to/migration.sql

# 3. Record it in schema_migrations
INSERT INTO schema_migrations (name, commit_sha, applied_by, file_sha256)
VALUES ('NNN_name.sql', 'COMMIT_SHA', current_user, 'FILE_SHA256');
```

## Weekly Drift Check

The `drift-report.yml` GitHub Action runs every Monday at 06:00 UTC. It connects to
production using the `gda_drift_reader` role (via `DRIFT_DATABASE_URL` GitHub secret)
and compares `schema_migrations` entries against the migration files on main.

**Alerts on:**
- Migrations in production that don't exist on main (unversioned modification)
- SHA-256 mismatches between production and main (content drift)

**Setup:** Add `DRIFT_DATABASE_URL` as a GitHub Actions repository secret:
```
postgresql://gda_drift_reader:PASSWORD@PRODUCTION_HOST:5432/gda_command
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Application Postgres connection (gda role) |
| `MIGRATION_DATABASE_URL` | Production | Migrator Postgres connection (gda_migrator role) |
| `DEPLOY_COMMIT_SHA` | Auto | Set via Docker build arg from `git rev-parse HEAD` |
| `MIGRATION_SKIP_MANIFEST_CHECK` | No | Break-glass: bypass manifest hash verification |
| `MIGRATION_USE_APP_ROLE_FOR_DDL` | No | Break-glass: use app role for DDL (requires file) |
| `POSTGRES_MIGRATOR_PASSWORD` | Production | Password for gda_migrator role |
