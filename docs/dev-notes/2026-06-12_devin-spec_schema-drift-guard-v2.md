# Devin spec — Schema drift guard v2: detect bare column references in SELECT lists

## Problem

The schema drift guard shipped in PR #805 (`apps/backend-v3/src/scripts/check_schema_drift.ts`) only catches `table.column` references where the table is explicitly named. It misses **bare column references** inside SELECT lists.

**Live miss (this week):** PR #795 introduced this SQL in `apps/backend-v3/src/workers/incumbent-enrichment.ts`:

```sql
SELECT id, solicitation_number, naics, agency,
       place_of_performance_state,
       value_min::text, value_max::text
FROM opportunities
WHERE deleted_at IS NULL ...
```

`place_of_performance_state` does not exist on `opportunities` (actual column is `place_of_performance`). The guard did NOT flag this because the column is unqualified. The cron crashed every night at 06:00 UTC since the merge, blocking 213 enrichments.

This is the **second** bare-column drift bug to slip past the guard in 48 hours (the first was the original cleanup-sprint motivation).

## Required change

Extend `check_schema_drift.ts` to detect **bare column references** in SELECT lists where the FROM clause unambiguously identifies a single table.

### Detection strategy

For each SQL-like template string in scanned files:

1. **Identify the primary FROM table.** If the query has exactly one `FROM <known_table>` (no JOINs, no subqueries), capture that table.
2. **Extract the SELECT projection list** — the tokens between `SELECT` and the first `FROM`.
3. **Tokenize the projection list** by commas (respecting parens depth for function calls like `COUNT(*)`, `COALESCE(a, b)`, `value_min::text`).
4. For each projected token:
   - Strip type casts (`::text`, `::int`, etc.)
   - Strip aliases (`AS foo`, trailing identifier)
   - Strip function call wrappers — extract the innermost identifier(s)
   - If the resulting token is a bare identifier (no `.` prefix) and matches `/^[a-z_][a-z0-9_]*$/`, check it against the FROM table's columns
   - If not found, emit a violation with `reason: 'unknown_column'` and the bare column name

5. **Also check WHERE clause bare references** for single-table queries: parse `WHERE <col> <op> ...` and `AND <col> <op> ...`, skip noise words from `SQL_NOISE`, validate against the FROM table.

### Skip conditions (avoid false positives)

- Multi-table queries (any JOIN or comma-separated FROM list) — skip bare-column checking; only `table.column` enforcement applies
- Subqueries — skip (too complex for regex; defer to a future AST-based pass)
- `SELECT *` — skip column enforcement
- Tokens matching `SQL_NOISE` set — skip
- Aggregate function results without an alias (`COUNT(*)`, `MAX(NOW())`) — skip
- Star-prefixed subexpressions or computed expressions (`opp_data->>'foo'`, `EXTRACT(epoch FROM ...)`) — extract underlying identifiers and validate those instead

### Allowlist

Add a new section to `scripts/ci/schema-drift-allowlist.txt`:

```
# Bare column refs explicitly approved (e.g., common variable names that also match column patterns)
bare-column:opportunities:legacy_field
```

Format: `bare-column:<table>:<column>` — one per line.

## Files to change

1. **`apps/backend-v3/src/scripts/check_schema_drift.ts`**
   - Add the SELECT/WHERE bare-column detector functions
   - Extend allowlist parser to handle `bare-column:` lines
   - Update CLI help / usage docstring
   - Bump internal version string (if present)

2. **Tests** — `apps/backend-v3/src/scripts/check_schema_drift.test.ts` (create if missing)
   - Add cases:
     - Single-table SELECT with bare unknown column → violation
     - Single-table SELECT with bare known column → OK
     - Multi-table JOIN with bare column → no violation (skip)
     - SELECT with cast and bare unknown column → violation
     - SELECT with COUNT(*) wrapping unknown column → violation
     - SELECT * → no enforcement
     - Bare column matching SQL_NOISE → no violation
     - WHERE clause bare unknown column → violation
     - Allowlisted bare column → no violation

3. **Replay test** — add a fixture string that reproduces the PR #795 SELECT verbatim, assert the guard fires.

## Acceptance criteria

- Running the guard against current `main` (with #808 already merged, so the bug is fixed) yields 0 violations
- Running the guard against the pre-#808 state of `incumbent-enrichment.ts` MUST emit a violation for `place_of_performance_state`
- Existing `table.column` enforcement is unchanged
- All existing CI green
- New allowlist entries documented inline at top of `schema-drift-allowlist.txt`

## Out of scope

- Subquery support (deferred)
- AST-based parsing (deferred — regex is sufficient for the common cases above)
- Frontend TypeScript-side type checking (separate concern)
- Auto-fix or suggestions (just flag)

## Branch / PR

- Branch: `feat/schema-drift-guard-bare-columns`
- Base: latest `main` (must include #807 and #808 merges first; sequence matters)
- PR title: `feat: schema drift guard — detect bare column refs in single-table queries`
- Reference: issue #795 (the miss), issue #808 (the fix), this issue

## Sequencing

This PR depends on #808 being merged first. If #808 is still open when Devin starts, Devin should:
1. Wait for #808 merge OR
2. Implement against current main (the bug will already be fixed) but add the regression test using a fixture string

## Pre-existing CI failures

Will be admin-overridden at merge: `Compose Drift Check`, `LLM Router Gates (F-215 D4)`.
