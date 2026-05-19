# Migrations

SQL migration files are applied in alphabetical order by filename. Each file must have a unique numeric prefix (e.g., `047_`).

## Naming convention

If a migration number collides with an existing file, the second file gets a `b` suffix (e.g., `036b_vehicle_classification.sql`). The CI check (`test-unique-migration-numbers.ts`) enforces uniqueness across the full prefix including the letter suffix — `036` and `036b` are distinct prefixes.

## Adding a new migration

Use the next available number: `ls migrations/*.sql | tail -1` to find the highest. The CI "Migration Smoke Test" job runs all migrations against a fresh Postgres on every PR.
