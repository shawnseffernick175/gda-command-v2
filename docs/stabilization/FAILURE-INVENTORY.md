# GDA Command v2 — Recurring Failure Inventory

**Date:** 2026-05-19
**Scope:** All production failures observed across Chats 1–11 (last 30 days)
**Purpose:** Inventory every known recurring failure, root cause hypothesis, and proposed regression test — before any fixes are written.

---

## How This Was Built

Sources examined:
- All 11 Devin session transcripts (Chats 1–11)
- Production Docker container logs (`gda-backend`, `gda-v2-backend`) — last 48h
- `docker inspect` restart counts
- `dmesg` OOM kill history (none found)
- Phase 4 Audit FINDINGS.md (24 findings)
- Git log (PRs #1–#214)
- Migration files (44 SQL files)
- Backend source code (server.ts, migrate.ts, db.ts, feed-sync.ts, agent-scheduler.ts)

---

## Failure Summary

| # | Frequency | Severity | Failure | Status |
|---|-----------|----------|---------|--------|
| F-001 | Daily | P0 | Migration 044 UUID crash → restart loop | **Fixed** (PR #216 — root fix; PR #213 — entrypoint resilience) |
| F-002 | Daily | P0 | No unhandledRejection handler — any async error kills server | **Fixed** (PR #213) |
| F-003 | Every deploy | P1 | Migration 028 FK delete ordering | **Fixed** (PR #211) |
| F-004 | Every 6h | P1 | SAM sync upserts fail on empty timestamps — 13-17 records lost per cycle | **Fixed** (PRs #218, #220, #222, #223 — mapper fix + backfill + automated verify + QA Center) |
| F-005 | Every 6h | P1 | GovTribe/DIBBS API fetch fails for every keyword | Open |
| F-006 | Every 6h | P1 | GovWin API returns HTML instead of JSON | Open |
| F-007 | On user action | P1 | Sidebar search crashes on undefined `.type` field | **Fixed** (PR #206) |
| F-008 | On user action | P1 | LLM calls hang forever — no timeout, chat freezes | **Fixed** (PR #194) |
| F-009 | On every write | P1 | Versioning triggers fire 3× per write (dedup masks it) | **Fixed in audit** (PR #208) |
| F-010 | On fresh deploy | P1 | Duplicate migration numbers (036, 038, 039, 040) — undefined ordering | **Fixed** (PR #224) |
| F-011 | On fresh deploy | P1 | Missing migration 024 — file not in repo, schema_migrations references it | Open |
| F-012 | Always | P2 | 42 catch blocks swallow errors silently — failures invisible | **Fixed in audit** (PR #208) |
| F-013 | On startup | P2 | Background tasks start before DB is ready | **Fixed** (PR #213 — waitForDB) |
| F-014 | Preventive | P2 | No cross-file type-safety validation in migrations | Open (tracked separately) |
| F-015 | Every 6h | P2 | Ingest mappers (SAM, GovTribe, GovWin, FPDS) lack consistent input sanitization | Open (tracked separately) |
| F-016 | Always | P2 | Schema-mapper drift — mappers write fields the DB silently drops, no detection | Open (tracked separately) |
| F-017 | On fresh deploy | P2 | Migration ordering by number, not by dependency — implicit ordering can break if a migration depends on a table/column another migration creates | Open (tracked separately) |

---

## Detailed Findings

### F-001 — Migration 044 UUID Type Mismatch (THE Daily Crash)

**Root cause:** Migration `044_seed_version_zero.sql` tries to INSERT records using IDs like `"opp-003"` into a column that expects UUID format. PostgreSQL rejects the INSERT with `invalid input syntax for type uuid: "opp-003"`. The migration runner calls `process.exit(1)`, the entrypoint's `set -e` propagates it, Docker restarts the container, and the cycle repeats.

**Evidence:** Production logs from `gda-v2-backend` show 8 identical failures:
```
[migrate] FAILED on 044_seed_version_zero.sql: invalid input syntax for type uuid: "opp-003"
[migrate] FAILED on 044_seed_version_zero.sql: invalid input syntax for type uuid: "opp-003"
[migrate] FAILED on 044_seed_version_zero.sql: invalid input syntax for type uuid: "opp-003"
... (8 times)
```

**Current mitigation:** PR #213 makes migration failures non-fatal in the entrypoint, so the server starts anyway. The new `gda-backend` container has 0 restarts. But migration 044 is still broken and never applied.

**Proposed fix:** Fix migration 044 to handle both UUID and non-UUID IDs. Use `CAST` with a fallback, or filter to only seed records with valid UUIDs.

**Proposed regression test:** The CI migration smoke test (PR #212) already runs all migrations against a fresh Postgres. If 044 is fixed, this test catches regressions. Additionally: add an assertion that `044_seed_version_zero.sql` succeeds against a DB with non-UUID opportunity IDs.

---

### F-002 — No unhandledRejection Handler

**Root cause:** Node.js 18+ terminates the process on any unhandled promise rejection. The server had no `process.on('unhandledRejection')` handler. Any async error in background tasks (feed sync, agent scheduler, webhook calls) could silently kill the process.

**Evidence:** No stack trace in Docker logs before crashes — the process just dies. Consistent with Node's default unhandled-rejection behavior (exits with code 1, no output).

**Status:** **Fixed** in PR #213 — added `unhandledRejection` handler that logs and continues, and `uncaughtException` handler that logs then exits cleanly.

**Regression test needed:** A unit test that verifies the handlers are installed: `assert(process.listenerCount('unhandledRejection') > 0)`.

---

### F-003 — Migration 028 FK Delete Ordering

**Root cause:** Migration `028_fix_mock_data_patterns.sql` deleted from `report_templates` before `scheduled_reports`, violating the FK constraint `scheduled_reports.template_id → report_templates.id`.

**Evidence:** Chat 10 session — production crash on migration run.

**Status:** **Fixed** in PR #211 — reordered DELETEs to respect FK constraints.

**Regression test:** CI migration smoke test (PR #212) runs all migrations on fresh DB and catches FK violations.

---

### F-004 — SAM Sync Empty Timestamp Errors

**Root cause:** Some SAM.gov API responses return empty strings `""` for date fields like `response_deadline`. The upsert query passes this empty string directly to a `timestamp with time zone` column, which PostgreSQL rejects.

**Evidence:** Production logs show 13-17 errors per sync cycle (every 6 hours):
```json
{"level":"warn","msg":"sam_sync_upsert_error","error":"invalid input syntax for type timestamp with time zone: \"\""}
```
The sync completes (5000 fetched, 4987 upserted, 13 errors) but 13 opportunities are silently dropped.

**Proposed fix:** In `mapSAMRecord()` in `sam-api.ts`, convert empty strings to `null` before passing to the query.

**Proposed regression test:** Unit test that calls `mapSAMRecord()` with an empty `response_deadline` and asserts the mapped value is `null`, not `""`.

---

### F-005 — GovTribe/DIBBS API Fetch Failures

**Root cause:** The GovTribe and DIBBS API calls fail with `"fetch failed"` for every keyword search. This could be DNS resolution, API key issues, or the APIs being offline/deprecated.

**Evidence:** Production logs:
```json
{"level":"warn","msg":"govtribe_keyword_error","keyword":"SETA","error":"fetch failed"}
{"level":"warn","msg":"govtribe_keyword_error","keyword":"cybersecurity","error":"fetch failed"}
{"level":"warn","msg":"dibbs_keyword_error","keyword":"IT","error":"fetch failed"}
```

**Proposed fix:** Investigate whether GovTribe/DIBBS APIs are reachable at all from the VPS. If the APIs are down or require auth, disable the sync for those sources and log it clearly. Don't silently fail every 6 hours.

**Proposed regression test:** Health check endpoint that reports which gov data sources are reachable.

---

### F-006 — GovWin API Returns HTML Instead of JSON

**Root cause:** The GovWin API endpoint is returning an HTML page (likely a login/error page) instead of a JSON response.

**Evidence:**
```json
{"level":"warn","msg":"govwin_fetch_error","error":"Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON"}
```

**Proposed fix:** Add response content-type validation before parsing. If GovWin returns HTML, log the actual URL and status code for debugging. Likely the API key expired or the endpoint URL changed.

**Proposed regression test:** Unit test that mocks a non-JSON response and asserts the error is logged with the status code and URL.

---

### F-010 — Duplicate Migration Numbers

**Root cause:** Parallel development sessions (Chats 8-9) created migrations with the same number prefix. Files `036_company_entities.sql` / `036_vehicle_classification.sql`, `038_ensure_intel_summary.sql` / `038_merger_context.sql`, `039_capture_discipline.sql` / `039_pgvector_safe.sql`, `040_ai_gateway.sql` / `040_seed_anomaly_rules.sql`.

**Evidence:** `ls packages/backend/src/db/migrations/` shows 4 pairs of duplicate-numbered files.

**Proposed fix:** Renumber duplicate migrations to unique sequential numbers. Add a CI check that asserts no duplicate number prefixes exist.

**Proposed regression test:** CI script: `ls migrations/*.sql | sed 's/_.*$//' | sort | uniq -d | wc -l` must equal 0.

---

### F-011 — Missing Migration 024

**Root cause:** `schema_migrations` on production references `024_seed_knowledge_collections.sql` but the file does not exist in the repo.

**Evidence:** Phase 4 audit (FINDINGS.md DATA-002).

**Proposed fix:** Reconstruct migration 024 from the production database state (inspect `knowledge_collections` table) and commit the file.

**Proposed regression test:** CI check that every `.sql` file in migrations directory has a corresponding entry in a expected-files list.

---

### F-014 — No Cross-File Type-Safety Validation in Migration System

**Root cause:** The migration runner executes raw SQL files sequentially with no validation that column types referenced in later migrations match the types declared in earlier ones. Migration 044 assumed `record_version.record_id` was UUID (used `::uuid` cast) when it was actually TEXT. Nothing in CI caught this mismatch before it reached production.

**Evidence:** F-001 (migration 044 daily crash) was caused by exactly this class of bug — a column-type mismatch across migration files that only surfaced at runtime.

**Proposed fix:** A CI check that parses all migration SQL files and validates that column types referenced in INSERT/UPDATE/CAST operations match the CREATE TABLE definitions from earlier migrations. This is a preventive measure — tracked as separate work, not blocking current stabilization fixes.

**Proposed regression test:** CI script that scans migration files for `::uuid`, `::integer`, `::boolean` casts and cross-references them against the column types from CREATE TABLE statements.

---

### F-015 — Ingest Mappers Lack Consistent Input Sanitization

**Root cause:** The empty-string-to-null bug fixed in F-004 (SAM mapper `responseDeadLine`) is a symptom of a broader pattern: all four ingest mappers (SAM, GovTribe, GovWin, FPDS) use `??` for nullish coalescing, which does not catch empty strings. Any TIMESTAMPTZ, NUMERIC, or BOOLEAN column receiving an empty string from an API response will cause an upsert failure — the same silent data loss seen in F-004.

**Evidence:** F-004 confirmed the pattern in the SAM mapper. The same `raw.field ?? null` pattern appears in `govtribe-api.ts`, `govwin-api.ts`, and `fpds-api.ts` for date and numeric fields.

**Proposed fix:** Audit all four mapper files. Apply the `tsOrNull()` pattern to every TIMESTAMPTZ field and add equivalent `numOrNull()` for NUMERIC fields. This is a systematic sweep — tracked as separate work, not blocking current stabilization fixes.

**Proposed regression test:** Extend `sam-api-mapper.test.ts` pattern to all four mappers. Each test seeds empty-string inputs for every date/numeric field and asserts null output.

---

### F-016 — Schema-Mapper Drift (No Detection of Orphaned Fields)

**Root cause:** Ingest mappers return plain objects. The INSERT statements reference specific columns by positional `$N` parameters. If a mapper produces a field that doesn't exist in the target table, the field is silently discarded — no error, no warning. Conversely, if the schema adds a column the mapper doesn't populate, there's no compile-time or CI-time detection.

**Evidence:** PR #218 added `archive_date: tsOrNull(raw.archiveDate)` to the SAM mapper. The `sam_opportunities` table has no `archive_date` column. The field was produced by the mapper and silently dropped by the INSERT. Devin Review caught it; nothing else did.

**Proposed fix:** Audit all four ingest mappers against their target table schemas. Add a CI check that fails when a mapper writes a field that doesn’t exist in the target table. Options: (a) a static analysis script that parses mapper return keys and compares to CREATE TABLE columns, or (b) typed interfaces for each table’s insertable row shape, replacing untyped objects with compile-time checked types.

**Proposed regression test:** CI script that extracts field names from each mapper’s return object and cross-references them against the column list in the corresponding INSERT statement. Any mismatch fails the build.

### F-017 — Migration Ordering by Number, Not by Dependency

**Root cause:** The migration runner sorts files alphabetically by filename and applies them in that order. There is no mechanism to declare that one migration depends on a table or column created by another. If two migrations have adjacent numbers but one depends on schema created by the other, the system relies on implicit filename ordering — which is fragile and undocumented.

**Evidence:** The CI check added for F-010 catches duplicate number prefixes but not the harder case: a migration that references a table or column created by a migration that happens to sort after it. The migration smoke test (running all migrations from scratch) catches this at CI time, but only for the current set of migrations — it doesn't prevent future PRs from introducing ordering bugs.

**Proposed fix:** Track as preventive work. Options: (a) add a comment-based dependency declaration (e.g., `-- depends: 036`) and validate the DAG in CI, (b) document the constraint and rely on the existing smoke test to catch violations, or (c) adopt a migration tool that handles dependency ordering natively.

**Proposed regression test:** The existing migration smoke test partially covers this (applying all migrations from scratch catches ordering errors). A more robust check would parse `CREATE TABLE` / `ALTER TABLE` / `INSERT INTO` references and verify they sort after the migration that creates the referenced object.

---

## Priority Ranking (Top 3 for Immediate Fix)

Based on frequency and user impact:

| Priority | Failure | Why First |
|----------|---------|-----------|
| **1** | F-001 (Migration 044 UUID crash) | This is THE daily crash. Mitigated but not fixed. Migration 044 never applied means no version-0 snapshots exist. |
| **2** | F-004 (SAM sync empty timestamps) | Runs every 6 hours, silently drops 13-17 opportunities per cycle. Data loss accumulates. |
| **3** | F-010 (Duplicate migration numbers) | Makes fresh deploys unpredictable. Must be fixed before any new migration work. |

---

## Failures Already Fixed (Verification Needed)

These were fixed in previous PRs but should be verified on production:

| Failure | Fixed In | Verified on Prod? |
|---------|----------|-------------------|
| F-002 (unhandledRejection) | PR #213 | Yes — `gda-backend` running with 0 restarts |
| F-003 (Migration 028 FK) | PR #211 | Yes — migration succeeds |
| F-007 (Sidebar search crash) | PR #206 | Needs verification |
| F-008 (LLM timeout/hang) | PR #194 | Needs verification |
| F-009 (Triple triggers) | PR #208 | Needs verification |
| F-012 (Silent catch blocks) | PR #208 | Needs verification |
| F-013 (DB readiness) | PR #213 | Yes — logs show `db_ready` |
