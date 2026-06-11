# Schema Drift Guard — Developer Notes

CI job that prevents SQL column/table references in source code from drifting out of sync with the live database schema.

---

## What it checks

The checker scans all `.ts` and `.tsx` files in `apps/backend-v3/src/` and `packages/frontend-v3/src/` for SQL string literals and template literals. It extracts:

- **Table references** after `FROM`, `JOIN`, `INTO`, `UPDATE` keywords.
- **Column references** in `table.column` dot notation.

Each reference is cross-referenced against a JSON snapshot of the staging database's `public` schema. Any table or column not found in the snapshot is reported as a violation.

---

## How to run locally

```bash
# 1. Build the backend so the checker is compiled to dist/
cd apps/backend-v3
npx tsc

# 2. Generate a schema snapshot (requires DATABASE_URL)
export DATABASE_URL="postgresql://gda:gda_dev_password@localhost:5432/gda_command"
cd ../..
bash scripts/ci/check-schema-drift.sh

# Or run the checker directly against an existing snapshot:
node apps/backend-v3/dist/scripts/check_schema_drift.js \
  --schema dist/schema-snapshot.json \
  --scan apps/backend-v3/src packages/frontend-v3/src \
  --allowlist scripts/ci/schema-drift-allowlist.txt
```

---

## How to add a false positive to the allowlist

Edit `scripts/ci/schema-drift-allowlist.txt`. Add one entry per line:

- `table_name` — suppresses all references to that table.
- `table_name.column_name` — suppresses a specific column reference.

Lines starting with `#` are comments. Always add a justifying comment above the entry.

```
# pgboss tables live in their own schema, not public
pgboss.job
```

Commit the allowlist change alongside the PR that introduces the flagged reference.

---

## How the schema snapshot is generated

The `scripts/ci/check-schema-drift.sh` wrapper connects to `$DATABASE_URL` and runs:

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

The result is converted to JSON (`{ tableName: [col1, col2, ...] }`) and written to `dist/schema-snapshot.json`. In CI, a service container provides a fresh Postgres instance with migrations applied.

---

## Limitations

- **Regex-based extraction** — the checker does not parse TypeScript AST or SQL AST. It catches the most common patterns but is not exhaustive.
- **Dynamic SQL** — runtime-constructed query strings (e.g., string concatenation with variables) are not detected.
- **ORM calls** — TypeORM entity definitions, query builder chains, and similar ORM patterns are out of scope.
- **Non-public schemas** — only `public` schema tables are checked. References to `pgboss.*` or other schemas should be added to the allowlist.

For patterns the regex cannot catch, add an explicit test fixture or integration test.

---

## What to do when the CI job fails

1. **Read the violation report** — each line shows `file:line — table.column (reason)`.
2. **If the reference is wrong** — fix the column or table name in the source code.
3. **If the reference is a false positive** — add it to `scripts/ci/schema-drift-allowlist.txt` with a comment explaining why, and commit alongside your PR.
4. **If the schema is missing a column** — add a migration to create the column, then the checker will pass once the CI database has the migration applied.
