# Devin spec — Fix incumbent enrichment column drift

## Problem

The incumbent enrichment cron (PR #795, merged 2026-06-11) crashed every night at 06:00 UTC with:

```
column "place_of_performance_state" does not exist
{"msg":"cron_incumbent_enrichment_error"}
```

**Live impact:** 0 of 213 eligible relevant opportunities have been enriched. 100% of relevant opportunities still show missing incumbent. Crashes immediately on the initial SELECT — never makes a single FPDS or USAspending call.

## Root cause

PR #795 assumed `opportunities.place_of_performance_state` exists. It does not. The actual column on `opportunities` is `place_of_performance` — a single **TEXT** field (free-form, e.g. `"Norfolk, VA"`, `"Washington, DC"`, or sometimes just `"VA"`).

This is exactly the type of schema drift the new CI guard (PR #805) was built to catch. Either the guard's allowlist needs tightening, or it wasn't running on PR #795's branch when it merged.

## Files to change

### 1. `apps/backend-v3/src/workers/incumbent-enrichment.ts`
- Change SELECT column list from `place_of_performance_state` → `place_of_performance`
- Update the row type and the `OpportunityForIncumbent` mapping to expose `place_of_performance: string | null`

### 2. `apps/backend-v3/src/services/enrichment/incumbent.ts`
- Update `OpportunityForIncumbent` type (line ~27): rename `place_of_performance_state` → `place_of_performance`
- Add a small parser that extracts a US state code (2 letters) from the free-form text. Examples:
  - `"Norfolk, VA"` → `"VA"`
  - `"Washington, DC 20301"` → `"DC"`
  - `"Multiple Locations, USA"` → `null`
  - `"VA"` → `"VA"`
  - `null` or `""` → `null`
  - Implement as: regex match `/(?:^|,\s*)([A-Z]{2})(?:\s+\d{5}(-\d{4})?)?\s*$/` against the upper-cased trimmed string, then validate the 2-letter token is in a US-state allowlist (50 states + DC + PR + GU + VI + AS + MP).
- Use the parsed state where the old code passed `opp.place_of_performance_state` directly to FPDS/USAspending filters (lines ~130, ~222). If the parser returns `null`, omit the state filter (do not pass an empty string).

### 3. `apps/backend-v3/src/scripts/backfill_incumbent.ts`
- Same column rename and parser usage as #2

### 4. Tests
- Add vitest cases for the state parser covering: `"Norfolk, VA"`, `"Norfolk, VA 23501"`, `"Washington, DC"`, `"VA"`, `"Multiple Locations"`, `null`, `""`, `"foo bar XX"` (invalid two-letter not in allowlist → null), `"Norfolk, Virginia"` (full state name → null; do NOT attempt full-name parsing in this pass).

## Acceptance criteria

- The 06:00 UTC `incumbent-enrichment` cron runs to completion without error
- `total_eligible` is correctly logged (~213 rows as of 2026-06-12)
- For any row where the parser returns a valid US state code, FPDS and USAspending calls include the state filter
- For rows with unparseable place_of_performance, the lookup proceeds without a state filter (no early-return, no skip)
- Existing tests still pass
- CI schema drift guard (`apps/backend-v3/src/scripts/check_schema_drift.ts`) passes — verify no other dead column refs were introduced

## Verification after merge

After backend rebuilds, manually trigger the worker:

```bash
docker exec gda-backend-v3 node -e "require('./apps/backend-v3/dist/workers/incumbent-enrichment').runIncumbentEnrichment().then(r => console.log(JSON.stringify(r,null,2)))"
```

Or wait for the next 06:00 UTC cron and inspect logs.

## Out of scope

- Do NOT add `place_of_performance_state` as a new column on `opportunities`. Parsing the existing text field is the right move — adding the column would require a backfill across 17,000+ rows and creates more drift.
- Do NOT touch the GovTribe throttle (separate issue #807 in flight).
- Do NOT modify the existing `place_of_performance` column type.

## Branch / PR

- Branch: `fix/incumbent-place-of-performance-parser`
- Base: latest `main` (HEAD post-cleanup-sprint)
- PR title: `fix: incumbent enrichment — parse state from place_of_performance text`
- Reference issue + the cron failure log line in PR description

## Pre-existing CI failures

Will be admin-overridden at merge: `Compose Drift Check`, `LLM Router Gates (F-215 D4)`.
