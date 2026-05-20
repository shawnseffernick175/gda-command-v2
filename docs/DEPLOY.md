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

### Nuclear option (manual SQL)

> **PRECONDITION:** Before using this procedure, confirm the migration file exists
> on `main` at the commit the production image was built from. If it does not, **STOP**.
> Merge the file to `main` first, then redeploy. The Nuclear option exists for runner
> bugs, not for applying unmerged migrations. Use of this procedure is logged via
> `applied_by = current_user`; the weekly drift check will flag any migration whose
> hash doesn't match `main` regardless of how it was applied.

If the migration runner itself is broken:

```bash
# 1. Connect directly to Postgres
psql "postgresql://gda:PASSWORD@localhost:5432/gda_command"

# 2. Run the migration SQL manually
\i /path/to/migration.sql

# 3. Record it in schema_migrations
INSERT INTO schema_migrations (name, commit_sha, applied_by, file_sha256)
VALUES ('NNN_name.sql', 'COMMIT_SHA', current_user, 'FILE_SHA256');
```

## Weekly Drift Check

The `drift-report.yml` GitHub Action runs every Monday at 06:00 UTC. It connects to
production using `DRIFT_DATABASE_URL` (a GitHub Actions repository secret) and compares
`schema_migrations` entries against the migration files on main.

> **Note:** Until F-020 lands (role separation), `DRIFT_DATABASE_URL` uses the `gda`
> application role credentials. Once F-020 creates `gda_drift_reader` (SELECT-only on
> `schema_migrations`), the secret should be updated to use that role instead.

**Alerts on:**
- Migrations in production that don't exist on main (unversioned modification)
- SHA-256 mismatches between production and main (content drift)

**Setup:** Add `DRIFT_DATABASE_URL` as a GitHub Actions repository secret:
```
postgresql://gda:PASSWORD@PRODUCTION_HOST:5432/gda_command
```

## MIGRATION_DATABASE_URL (reserved for F-020)

The migration runner supports a separate `MIGRATION_DATABASE_URL` env var for role
separation. This is plumbed but not active until F-020 ships the infrastructure-level
role demotion. When `MIGRATION_DATABASE_URL` is set, the runner uses it instead of
`DATABASE_URL`. When unset (current default), it falls back to `DATABASE_URL`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Application Postgres connection (gda role) |
| `MIGRATION_DATABASE_URL` | No | Reserved for F-020 role separation. Leave empty until then. |
| `DEPLOY_COMMIT_SHA` | Auto | Set via Docker build arg from `git rev-parse HEAD` |
| `MIGRATION_SKIP_MANIFEST_CHECK` | No | Break-glass: bypass manifest hash verification |
