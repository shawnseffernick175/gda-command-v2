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

See paired tests for examples:

- `009_capture_stage.test.ts` — UPDATE opportunities with status→stage mapping
- `010_opp_data_source.test.ts` — UPDATE opportunities with URL-based classification
- `027_remove_mock_data.test.ts` — DELETE mock data by ID pattern, preserve real data
- `045_rename_duplicate_migrations.test.ts` — DELETE from schema_migrations
- `047_gov_source_deprecation.test.ts` — UPDATE gov_source_feeds to deprecate feeds
- `048_cleanup_fake_dibbs_records.test.ts` — DELETE from opportunities + FK tables
- `049_reverse_govtribe_deprecation.test.ts` — UPDATE gov_source_feeds
- `052_fix_migration_051_ordering.test.ts` — UPDATE + ADD CONSTRAINT ordering fix

Each test includes a doc comment explaining what break would be induced to
verify the test catches regressions.

## Migration audit (F-018)

All 55 migrations have been audited. The following are **state-dependent**
(they modify existing data, not just schema):

| Migration | Operation | Has test? |
|-----------|-----------|-----------|
| 009_capture_stage | UPDATE opps status→stage | ✅ |
| 010_opp_data_source | UPDATE opps URL→data_source | ✅ |
| 018_fix_bot_glossary_and_sources_columns | UPDATE bot_glossary/bot_sources | ⚠️ low risk — populates columns added in same migration |
| 023_rename_backlog_kpi | UPDATE single KPI label | ⚠️ low risk — single-row rename |
| 027_remove_mock_data | DELETE mock rows by ID pattern | ✅ |
| 028_fix_mock_data_patterns | DELETE mock rows by ID pattern | ⚠️ same pattern as 027 |
| 029_q1_2026_financial_kpis | UPDATE financial KPIs with real data | ⚠️ low risk — seed data override |
| 045_rename_duplicate_migrations | DELETE from schema_migrations | ✅ |
| 047_gov_source_deprecation | UPDATE gov_source_feeds | ✅ |
| 048_cleanup_fake_dibbs_records | DELETE fake DIBBS records | ✅ |
| 049_reverse_govtribe_deprecation | UPDATE gov_source_feeds | ✅ |
| 051_fix_incumbent_source_constraint | UPDATE + ADD CONSTRAINT (buggy order) | covered by 052 |
| 052_fix_migration_051_ordering | UPDATE + ADD CONSTRAINT (fixed) | ✅ |
| 054_source_health_snapshots | UPDATE gov_source_feeds roles | ⚠️ low risk — config update |
| 055_govwin_wsapi_integration | UPDATE gov_source_feeds for govwin | ⚠️ low risk — config update |

**Not state-dependent** (excluded from audit):
- Pure DDL: 001-008, 011-015, 019-022, 025-026, 031-033, 035-036,
  036b, 037-040, 040b, 041-042, 046, 050, 053
- Trigger DDL: 034 (versioning), 043 (fix triggers)
- Idempotent upserts: 030 (monthly financials), 050 (ON CONFLICT DO UPDATE)
- Extension management: 004, 039b (pgvector)
- Seed-only: 016, 017, 019, 024, 038b, 044

Migrations marked ⚠️ are low-risk state operations (single-row renames,
config updates, or same-migration column population) that don't warrant
paired tests. If any of these become incident-relevant, add a test then.

## Infrastructure

The harness uses the **same Postgres instance** as the dev environment (from
docker-compose). Each test creates an ephemeral database with a unique name
(`gda_migration_test_{timestamp}_{random}`) and drops it in `afterAll()`.

This avoids Docker-in-Docker complexity and testcontainers overhead while still
testing against real Postgres behavior (constraints, plpgsql, etc.).
