# Migration Test Harness

Paired tests for **state-dependent** SQL migrations — migrations that modify
existing data (UPDATE, DELETE) rather than just adding schema (CREATE TABLE,
ADD COLUMN).

## When to write a paired test

Write a paired test when the migration **modifies existing data**:
- `UPDATE` statements that change existing rows
- `DELETE` / `TRUNCATE` statements that remove existing rows
- `DO $$ ... END $$` blocks that loop over existing data
- Any migration whose behavior depends on what's already in the database

## When NOT to write a paired test

Skip the paired test for **pure DDL** migrations that only add schema:
- `CREATE TABLE` / `CREATE INDEX`
- `ADD COLUMN` (with no `UPDATE` to backfill)
- `ALTER TABLE ... ADD CONSTRAINT` (on empty new columns)

These are deterministic regardless of existing data — they don't need
state-dependent validation.

## How to write one

Use the harness in `_harness.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { createSeededTestDb, applyMigration, destroyTestDb } from "./_harness";
import type pg from "pg";

let pool: pg.Pool;

afterAll(async () => {
  if (pool) await destroyTestDb(pool);
});

describe("Migration NNN: description", () => {
  it("does the expected state transformation", async () => {
    // 1. Create a test DB with all migrations applied UP TO (not including)
    //    the target migration, then seed with fixture data
    pool = await createSeededTestDb("NNN_migration_name.sql", {
      tables: [
        {
          table: "your_table",
          rows: [{ id: "test-1", column: "pre-migration-value" }],
        },
      ],
    });

    // 2. Verify pre-state
    const { rows: before } = await pool.query("SELECT ...");
    expect(before).toHaveLength(1);

    // 3. Apply the migration
    await applyMigration(pool, "NNN_migration_name.sql");

    // 4. Assert post-state
    const { rows: after } = await pool.query("SELECT ...");
    expect(after[0].column).toBe("post-migration-value");
  });
});
```

### Harness API

| Function | Description |
|----------|-------------|
| `createSeededTestDb(upToBefore, seed)` | Creates an ephemeral Postgres database, applies all migrations before the target, seeds fixture data |
| `applyMigration(pool, filename)` | Applies a single migration file against the test database |
| `destroyTestDb(pool)` | Drops the ephemeral test database (call in `afterAll`) |

### SeedSpec

```ts
interface SeedSpec {
  tables: Array<{
    table: string;
    rows: Array<Record<string, unknown>>;
  }>;
}
```

Keep it simple: no ORM, no schema validation. The test file is responsible for
providing seed data that matches the schema at that migration's point in history.

## Reference tests

See the three initial paired tests for examples:

- `045_rename_duplicate_migrations.test.ts` — DELETE from schema_migrations
- `048_cleanup_fake_dibbs_records.test.ts` — DELETE from opportunities + FK tables
- `049_reverse_govtribe_deprecation.test.ts` — UPDATE gov_source_feeds

Each test includes a doc comment explaining what break would be induced to
verify the test catches regressions.

## Infrastructure

The harness uses the **same Postgres instance** as the dev environment (from
docker-compose). Each test creates an ephemeral database with a unique name
(`gda_migration_test_{timestamp}_{random}`) and drops it in `afterAll()`.

This avoids Docker-in-Docker complexity and testcontainers overhead while still
testing against real Postgres behavior (constraints, plpgsql, etc.).

## Future: F-018

F-018 will audit all existing migrations for unmarked state dependencies.
Once that audit is complete, CI can enforce that every flagged migration has
a corresponding paired test file.
