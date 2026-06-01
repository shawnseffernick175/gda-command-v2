# V3 Migration Runner

**Owner:** Backend V3 (`apps/backend-v3/`)
**Tracker table:** `v3_schema_migrations`
**Migration directory:** `db/v3/migrations/`
**Runner script:** `db/v3/migrate.ts`

## How it works

The migration runner is a forward-only SQL applier. It:

1. Connects to the database via `V3_DATABASE_URL` (falls back to `DATABASE_URL`).
2. Bootstraps the `v3_schema_migrations` table using `v3_000_schema_migrations.sql`
   (uses `CREATE TABLE IF NOT EXISTS` — safe to re-run).
3. Reads already-applied filenames from `v3_schema_migrations`.
4. Scans `db/v3/migrations/` for `v3_*.sql` files, sorted lexicographically.
5. For each unapplied file: computes SHA-256, executes inside a transaction,
   records the result in the tracker.
6. On failure: rolls back the single failing migration and exits with code 1.

## File naming convention

```
v3_NNN_<descriptive_name>.sql
```

- `NNN` is a zero-padded three-digit sequence number (e.g., `001`, `017`, `023`).
- Each number MUST be unique. The runner sorts lexicographically, so
  `v3_017_agent_runs.sql` runs before `v3_018_govtribe.sql`.
- `v3_000_schema_migrations.sql` is special — it bootstraps the tracker itself
  and is always applied first (not recorded in the tracker).

## Adding a new migration

1. Determine the next sequence number (check `ls db/v3/migrations/` for the latest).
2. Create `db/v3/migrations/v3_NNN_your_description.sql`.
3. Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc. for
   idempotency — the migration may run against a DB where the object already
   exists from a manual apply.
4. Wrap multi-statement migrations in `BEGIN; ... COMMIT;` for atomicity.
5. Run locally:
   ```bash
   V3_DATABASE_URL=postgresql://gda:gda_dev_password@localhost:5432/gda_command \
     npx tsx db/v3/migrate.ts
   ```
6. CI will automatically run the "Schema Migration Dry-Run" check against a
   fresh Postgres to verify the full migration chain applies cleanly.

## Running migrations

### Local development

```bash
# Apply all pending migrations
V3_DATABASE_URL=postgresql://user:pass@localhost:5432/dbname npx tsx db/v3/migrate.ts
```

### Docker (production)

The `entrypoint.sh` in the backend-v3 Docker image runs `node db/v3/migrate.mjs`
(a pre-compiled bundle of the migration runner) before starting the Node.js
server. This means every container restart automatically applies any pending
migrations.

### CI

The `Backend V3 CI` workflow includes a "Schema Migration Dry-Run" job that:
- Starts a fresh `pgvector/pgvector:pg16` service container.
- Runs `npx tsx db/v3/migrate.ts` to apply all migrations from scratch.
- Verifies the tracker table is populated.
- Re-runs the runner to verify idempotency (no new migrations should apply).

## Tracker table schema

```sql
CREATE TABLE v3_schema_migrations (
  id            SERIAL        PRIMARY KEY,
  filename      TEXT          NOT NULL UNIQUE,
  file_sha256   TEXT          NOT NULL,
  applied_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  applied_by    TEXT          NOT NULL DEFAULT current_user,
  commit_sha    TEXT,
  execution_ms  INTEGER
);
```

## Health endpoint

`GET /v3/health/schema` returns:

```json
{
  "success": true,
  "data": {
    "version": "v3_023_color_team_reviews.sql",
    "migration_count": 23,
    "last_migration_at": "2026-06-01T04:49:00.000Z",
    "drift_detected": false
  }
}
```

- `version` — filename of the latest applied migration.
- `migration_count` — total number of recorded migrations.
- `last_migration_at` — timestamp of the most recent migration application.
- `drift_detected` — `true` if the tracker is missing or empty.

## Rollback

The runner is **forward-only** — there is no automatic rollback command. To
reverse a migration:

1. Write a new forward migration that undoes the change (e.g., `DROP TABLE`,
   `ALTER TABLE DROP COLUMN`).
2. Assign it the next sequence number.
3. Apply via the normal migration flow.

For emergency rollback on production, connect directly to `gda-postgres-staging`
and execute the reversal SQL manually, then delete the corresponding row from
`v3_schema_migrations`.

## Reconciliation (one-time, F-315a)

When the runner first executes against a staging database that was previously
managed via manual `psql` runs:

- `v3_000_schema_migrations.sql` creates the tracker (IF NOT EXISTS — safe).
- Each subsequent migration uses `IF NOT EXISTS` guards so it becomes a no-op
  if the table/index already exists.
- The tracker records each migration as "applied" even though the DDL was a
  no-op, bringing the DB into a managed state.
- From this point forward, new migrations are applied and tracked normally.
