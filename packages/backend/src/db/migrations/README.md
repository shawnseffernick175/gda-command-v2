# Migrations

SQL migration files are applied in alphabetical order by filename. Each file must have a unique numeric prefix (e.g., `047_`).

## Naming convention

If a migration number collides with an existing file, the second file gets a `b` suffix (e.g., `036b_vehicle_classification.sql`). The CI check (`test-unique-migration-numbers.ts`) enforces uniqueness across the full prefix including the letter suffix — `036` and `036b` are distinct prefixes.

## Adding a new migration

Use the next available number: `ls migrations/*.sql | tail -1` to find the highest. The CI "Migration Smoke Test" job runs all migrations against a fresh Postgres on every PR.

## State-dependent migrations

If a migration modifies existing data (UPDATE, DELETE on `schema_migrations` or application tables), it is **state-dependent** — it assumes prior rows exist. The CI smoke test runs from scratch and will not catch bugs that only surface on databases with prior state. For any state-dependent migration, add a regression test (e.g., `test-migration-045.ts`) that pre-populates the relevant prior state and asserts the migration completes without error. See F-017 in the failure inventory for context.
