# V3 Migration Runner

> **F-315a** — Schema migration runner & reconciliation layer for GDA Command V3.

## Overview

GDA Command V3 uses [node-pg-migrate](https://github.com/salsita/node-pg-migrate)
to manage forward-only SQL schema migrations. Every migration is a plain `.sql`
file stored in `apps/backend-v3/migrations/`.

The migration runner:

1. Runs automatically on container startup via `entrypoint.sh` (before the
   Fastify server binds its port).
2. Tracks applied migrations in two tables:
   - **`pgmigrations`** — node-pg-migrate's native tracker.
   - **`v3_schema_migrations`** — legacy tracker kept in sync for the
     `/v3/health/schema` endpoint and backward compatibility.
3. Exposes a dry-run mode for CI gating.

---

## Directory Layout

```
apps/backend-v3/
├── migrations/              ← canonical SQL migration files
│   ├── v3_000_schema_migrations.sql
│   ├── v3_001_initial.sql
│   ├── ...
│   └── v3_024_backfill_schema_migrations.sql
├── src/lib/migrate.ts       ← programmatic runner (node-pg-migrate wrapper)
├── entrypoint.sh            ← Docker ENTRYPOINT (runs migrate → server)
└── Dockerfile
```

---

## Migration File Conventions

| Rule | Detail |
|------|--------|
| **Naming** | `v3_NNN_descriptive_name.sql` — zero-padded three-digit sequence. |
| **Idempotency** | Use `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` where possible. |
| **Transactions** | Wrap multi-statement DDL in `BEGIN; ... COMMIT;` |
| **No down migrations** | V3 is forward-only. Rollback is handled via compensating migrations (see below). |
| **No data mutations** | Schema-only. Seed data goes in separate scripts. |

### Creating a New Migration

```bash
# From repo root:
touch apps/backend-v3/migrations/v3_025_my_new_feature.sql
# Edit the file, then commit.
```

Pick the next available number. CI will catch duplicate numbers.

---

## Running Migrations

### Development

```bash
cd apps/backend-v3

# Apply pending migrations:
npm run db:migrate

# Dry-run (shows what WOULD run, no changes):
npm run db:migrate:dry-run
```

Requires `DATABASE_URL` or `V3_DATABASE_URL` in your environment.

### Production (Container)

Migrations run automatically when `gda-backend-v3` starts. The
`entrypoint.sh` calls the compiled migration runner before `node server.js`.
If any migration fails, the container exits with code 1 and Docker will
restart it per the `restart: unless-stopped` policy.

### CI

The **V3 Schema Migration Dry-Run** workflow (`.github/workflows/v3-migration-dry-run.yml`)
spins up a clean Postgres, applies all migrations from scratch, then verifies:

- All migrations apply cleanly.
- `pgmigrations` and `v3_schema_migrations` are populated.
- Core V3 tables exist.

---

## Health Endpoint

```
GET /v3/health/schema
```

Returns:

```json
{
  "success": true,
  "data": {
    "version": "v3_024_backfill_schema_migrations",
    "applied_count": 25,
    "on_disk_count": 25,
    "drift_detected": false,
    "last_migration_at": "2026-06-01T10:00:00.000Z"
  },
  "meta": { ... }
}
```

| Field | Meaning |
|-------|---------|
| `version` | Name of the most recently applied migration. |
| `applied_count` | Number of migrations recorded in `pgmigrations`. |
| `on_disk_count` | Number of `.sql` files in `migrations/`. |
| `drift_detected` | `true` if `applied_count ≠ on_disk_count`. |
| `last_migration_at` | Timestamp of the last applied migration. |

The `/v3/ready` endpoint also includes `schema_version` in its checks.

---

## Rollback Path

V3 migrations are **forward-only**. There are no automatic down migrations.

To roll back a change:

1. **Write a compensating migration** — e.g., `v3_026_revert_xyz.sql` that
   `DROP TABLE`, `ALTER TABLE ... DROP COLUMN`, or undoes whatever the
   previous migration did.
2. Commit, push, and deploy normally.
3. The compensating migration applies on the next container restart.

This keeps the migration history append-only and auditable.

### Emergency Rollback

If a migration breaks staging and you need to roll back immediately:

1. Revert the Docker image to the previous tag.
2. Manually connect to Postgres and remove the broken migration from
   `pgmigrations` and `v3_schema_migrations`.
3. Apply any compensating DDL by hand.
4. Deploy the fixed image.

---

## Version Numbering

Migrations are numbered `v3_000` through `v3_NNN`. The `v3_` prefix denotes
the V3 schema era (post-legacy). Numbers are assigned sequentially; gaps are
allowed but discouraged.

### Renumbering History (F-315a)

The original `db/v3/migrations/` had duplicate version numbers:

| Original | Canonical (renumbered) |
|----------|----------------------|
| `v3_017_agent_runs_and_tool_calls` | `v3_017` (unchanged) |
| `v3_017_govtribe_connector` | → `v3_018` |
| `v3_018_doctrine_rules` | → `v3_019` |
| `v3_018_govwin_connector` | → `v3_020` |
| `v3_019_agent_decisions_and_pwin` | → `v3_021` |
| `v3_020_kb_documents_and_chunks` | → `v3_022` |
| `v3_021_color_team_reviews` | → `v3_023` |

`v3_024_backfill_schema_migrations` is the reconciliation migration that
ensures `v3_schema_migrations` is populated for all prior versions.

---

## First-Deploy Bootstrap (Staging Reconciliation)

When the runner is deployed to an existing database for the first time
(e.g., gda-postgres-staging), it auto-detects the situation:

1. Checks if `pgmigrations` exists (node-pg-migrate's tracker).
2. If **absent** but `v3_schema_migrations` **exists**, this is an existing DB.
3. Creates `pgmigrations` and seeds all `v3_000`→`v3_024` as already-applied.
4. The subsequent `runner()` call finds 0 pending migrations — **no-op**.

This is fully automatic and idempotent. No manual SQL needed on staging.

### Staging Schema Reconciliation (2026-06-01)

Cross-referenced `pg_dump --schema-only` from `gda-postgres-staging` against
all 25 canonical migrations. Results:

- **89 tables** in public schema on staging.
- **All V3 Cognition tables present**: `agent_decisions`, `agent_runs`,
  `agent_tool_calls`, `doctrine_rules_config`, `govtribe_cache`,
  `govtribe_credit_ledger`, `govtribe_credit_monthly`, `govwin_auth_state`,
  `govwin_cache`, `kb_chunks`, `kb_documents`, `pwin_features`, `pwin_outcomes`,
  `color_team_runs`, `color_team_findings`.
- **Zero table-level drift**: every `CREATE TABLE` in the migrations has a
  matching table on staging.
- **Naming note**: migration file `v3_019_doctrine_rules.sql` creates
  `doctrine_rules_config` (not `doctrine_rules`). The table name is correct;
  only the filename is potentially misleading.
- **`v3_schema_migrations` already existed** on staging — the original issue
  queried for `schema_migrations` (wrong name).

---

## Legacy Migration Runner

The original custom runner at `db/v3/migrate.ts` is preserved but deprecated.
The existing CI workflow (`v3-schema-drift.yml`) still references it for
backward compatibility. New work should use the node-pg-migrate runner.
