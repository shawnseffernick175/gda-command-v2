# V3 Database Migrations

## Overview

V3 migrations live in `db/v3/migrations/` and are applied by `db/v3/migrate.ts`.
The runner tracks applied files in the `v3_schema_migrations` table.

## Migration Contract

### Direction

Migrations are **forward-only**. There are no down/rollback migrations.
If a migration introduces a bug, ship a new forward migration to fix it.

### File naming

```
v3_NNN_short_name.sql
```

Files are sorted lexicographically. Use zero-padded three-digit sequence
numbers (`001`, `002`, …). Keep names short and descriptive.

### Bootstrap vs. application migrations

`v3_000_schema_migrations.sql` uses `IF NOT EXISTS` to create the tracker
table idempotently. **All other migrations must NOT use `IF NOT EXISTS`
for `CREATE TABLE`** (F-234 enforces this in CI). This ensures a failed
migration is caught immediately rather than silently skipped.

### Deploy integration

Migrations are applied automatically on every prod deploy via
`scripts/deploy-prod.sh`. The deploy script runs `db/v3/migrate.ts`
**before** recreating `backend-v3`, so the new backend always starts
against the expected schema.

- If migrations succeed (or none are pending), deploy continues normally.
- If a migration fails, deploy aborts **before** recreating the backend.
  The old (working) backend stays running.

Manual migration application is reserved for hotfix / recovery scenarios.

### Idempotency

The runner is idempotent — re-running deploy (or `migrate.ts` directly)
is safe. Applied migrations are tracked by filename and SHA-256 hash in
`v3_schema_migrations`. Already-applied files are skipped.

### CI coverage

The `V3 Migration Smoke Test` job (`.github/workflows/v3-schema-drift.yml`)
runs all migrations from scratch on every PR and push to `main`. It
verifies the tracker is populated and all expected tables exist.

## pg-boss Schema (Strategy B — F-220.1)

**The `pgboss` schema is created and managed by the pg-boss library at boot time.**

We do NOT manage the pg-boss schema via SQL migrations. The pg-boss library
(currently `^10.1.5`, installed as `10.4.2`) has its own internal migration
system that creates and upgrades its schema when `boss.start()` is called in
`apps/backend-v3/src/lib/queue.ts`.

### Why

pg-boss explicitly documents that it owns its schema. Previous attempts to
pre-create the schema via migration (the original `v3_004`) led to version
mismatches, missing tables (`pgboss.queue`, `pgboss.archive`), missing
partition infrastructure, and column naming errors (snake_case vs camelCase)
that caused the V3 backend to crash-loop on boot.

### Requirements

The database role used by the V3 backend **must have `CREATE` privilege** on
the database so pg-boss can create the `pgboss` schema:

```sql
GRANT CREATE ON DATABASE <dbname> TO <role>;
```

For staging:
```sql
GRANT CREATE ON DATABASE gda_command_staging TO gda_staging;
```

### Boot sequence

1. `db/v3/migrate.ts` runs — applies application-level migrations (tables in
   `public` schema: opportunities, captures, sources, analysis_jobs, etc.)
2. V3 backend starts — `boss.start()` creates/upgrades the `pgboss` schema.
3. `registerQueues()` creates queue partitions via `boss.createQueue()`.

### Queue registration

Queues are registered programmatically in `apps/backend-v3/src/lib/queue.ts`
via `boss.createQueue()`. This handles both the queue registry entry and
the partition DDL that pg-boss v10+ requires.

Current queues:
- `analysis-opportunity`
- `analysis-capture`
- `ingest-postprocess`
- `analysis-periodic-refresh`
- `analysis-model-version-sweep`

### Historical cleanup

If a historical environment has the old `v3_004_pgboss_bootstrap.sql` logged
in `v3_schema_migrations` AND a broken `pgboss` schema, run:

```sql
-- Drop the broken pgboss schema (pg-boss will recreate on next boot)
DROP SCHEMA IF EXISTS pgboss CASCADE;

-- The migration tracker entry can stay — the file has been rewritten to only
-- create analysis_jobs (IF NOT EXISTS), so it's harmless on re-runs.
```

Then restart the V3 backend; pg-boss will bootstrap cleanly.
