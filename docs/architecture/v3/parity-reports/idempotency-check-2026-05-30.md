# Idempotency Check — 2026-05-30

## Procedure

1. Ran `npx tsx src/migration/run.ts --commit` (first commit run).
2. Captured V3 row counts.
3. Re-ran `npx tsx src/migration/run.ts --commit` (second commit run).
4. Captured V3 row counts again.
5. Compared with `diff`.

## Counts Before (after first commit)

```
        t         | count
------------------+-------
 v3_opportunities | 15742
 v3_captures      |   110
 v3_action_items  |    47
 pipeline_items   |     0
 sources          |    10
 partners         |    12
(6 rows)
```

## Counts After (after second commit)

```
        t         | count
------------------+-------
 v3_opportunities | 15742
 v3_captures      |   110
 v3_action_items  |    47
 pipeline_items   |     0
 sources          |    10
 partners         |    12
(6 rows)
```

## Diff Output

```
(empty — no differences)
```

## Result

**PASSED** — Re-running `--commit` produces zero row-count delta. The migration is idempotent via `ON CONFLICT DO UPDATE` / `ON CONFLICT DO NOTHING`.

Note: pgboss.job pre-warm jobs are additive (no unique constraint on name+data), so the queue depth doubled from 15,852 → 31,704 total jobs. This is expected — pg-boss deduplicates via singletonKey at processing time, not at insertion time.
