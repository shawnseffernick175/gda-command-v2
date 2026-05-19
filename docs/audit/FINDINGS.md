# GDA Command v2 — Phase 4 Findings Report

**Audit Tag:** `audit-2026-05`
**Date:** 2026-05-19
**Auditor:** Devin
**Production:** https://gda.csr-llc.tech

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **P0 — Critical** | 4 |
| **P1 — High** | 7 |
| **P2 — Medium** | 8 |
| **P3 — Low** | 5 |
| **Total** | **24** |

### Top 10 Most Damaging Issues
1. **BROKEN-001** — Versioning triggers duplicated 3× (data integrity risk)
2. **STALE-001** — record_version has 0 rows (versioning not recording)
3. **RISK-001** — CORS allows all origins (security)
4. **RISK-002** — `xlsx` dependency has known Prototype Pollution (HIGH vuln)
5. **STALE-002** — 41 empty tables with full UI pages built
6. **BROKEN-002** — SAM monitor endpoint returns 6,746 rows unpaginated (2.1s)
7. **DEAD-001** — 27 mock data files no longer imported by routes
8. **DATA-001** — Duplicate migration numbers (4 pairs)
9. **DATA-002** — Missing migration file (024) — schema drift
10. **OBSERVE-001** — 42 catch blocks swallow errors silently

### Estimated Total Fix Effort
~16-24 hours across all P0 and P1 fixes.

---

## Category 1: Broken Code

### BROKEN-001 — Versioning Triggers Duplicated 3×
- **Severity:** P0
- **Location:** PostgreSQL triggers on 11 tables (opportunities, capture_plans, proposals, contacts, compliance_requirements, intel_items, color_reviews, risk_register, doctrine_drafts, cpars_records, knowledge_documents)
- **What's wrong:** Each `trg_version_*` trigger exists 3 times. Every INSERT/UPDATE/DELETE fires the trigger function 3 times. The trigger function has a 2-second dedup window that currently prevents triple-writes, but this is fragile and relies on timing.
- **Root cause:** Migration `034_versioning_softdelete.sql` was deployed 3 times to production (likely via separate deploy cycles that re-ran all migrations). The migration uses `CREATE TRIGGER` without `IF NOT EXISTS` or `DROP TRIGGER IF EXISTS` guards.
- **Blast radius:** Every write to any tracked table fires 3× the trigger function. Currently masked by the dedup logic but will cause triple version rows if edits happen within overlapping 2-second windows from different processes.
- **Proposed fix:** Run `DROP TRIGGER IF EXISTS trg_version_<name> ON <table>` for each duplicate, then recreate each trigger exactly once. Add `DROP TRIGGER IF EXISTS` guard to the migration.
- **Regression test:** Assert `SELECT COUNT(*) FROM pg_trigger WHERE tgname LIKE 'trg_version_%'` equals exactly 11.
- **Fix decision:** `___` (Shawn approves)
- **Estimated effort:** 1 hour

### BROKEN-002 — SAM Monitor Returns All 6,746 Rows Without Pagination
- **Severity:** P1
- **Location:** `packages/backend/src/routes/sam-monitor.ts` — `GET /api/sam-monitor/opportunities`
- **What's wrong:** Returns all 6,746 SAM opportunities in a single response. Response time: 2.15s. Will get worse as more SAM data is ingested.
- **Root cause:** The query uses `SELECT * FROM sam_opportunities` without LIMIT/OFFSET.
- **Blast radius:** Slow page load on SAM Monitor. As table grows, this will eventually timeout.
- **Proposed fix:** Add pagination (default 50/page) with `?page=&limit=` query params. Add `ORDER BY` and return total count in meta.
- **Regression test:** Assert response includes `meta.page`, `meta.totalCount` and returns ≤50 items by default.
- **Fix decision:** `___`
- **Estimated effort:** 1 hour

### BROKEN-003 — Two Migration Tracking Tables
- **Severity:** P2
- **Location:** PostgreSQL tables `_migrations` (22 rows) and `schema_migrations` (46 rows)
- **What's wrong:** Two separate migration tracking systems coexist. `_migrations` was used by an older runner and tracks a subset. `schema_migrations` is the current one. This causes confusion about which migrations are applied.
- **Root cause:** The migration runner was changed at some point without removing the old tracking table.
- **Blast radius:** Low — the current runner uses `schema_migrations`. But the orphan `_migrations` table is confusing for anyone auditing the database.
- **Proposed fix:** Document that `_migrations` is legacy. Consider dropping after verifying it's not referenced in code.
- **Regression test:** Verify migration runner only checks `schema_migrations`.
- **Fix decision:** `___`
- **Estimated effort:** 30 min

---

## Category 2: Stale Information

### STALE-001 — record_version Has 0 Rows (Versioning Never Recording)
- **Severity:** P0
- **Location:** `record_version` table, `fn_auto_version` trigger function
- **What's wrong:** The versioning system was built (W3), triggers installed, but `record_version` has 0 rows. No version history exists for any record.
- **Root cause:** Two contributing factors:
  1. Triggers were installed after initial data already existed (no retroactive version-0 snapshots)
  2. Most data mutations go through n8n webhooks or the ingest API, which may bypass the database triggers if they use different transaction patterns
  3. Only 11 opportunities exist and no user-initiated edits have occurred on them since trigger installation
- **Blast radius:** The "Version History" and "Restore" features on the frontend show empty history for every record. The soft-delete "Trash" page (`/admin/trash`) is empty. Users cannot recover accidentally deleted data.
- **Proposed fix:**
  1. Fix duplicate triggers first (BROKEN-001)
  2. Run a one-time "snapshot" migration that inserts version-0 for all existing records
  3. Verify that API routes that modify opportunities actually fire the triggers
- **Regression test:** After updating an opportunity via the API, assert `record_version` has a new row with the correct `table_name`, `record_id`, and `snapshot`.
- **Fix decision:** `___`
- **Estimated effort:** 3 hours

### STALE-002 — 41 Empty Tables With Full UI Pages
- **Severity:** P1
- **Location:** 41 database tables with 0 rows (see INVENTORY.md for full list)
- **What's wrong:** Features like Contacts, Proposals, Compliance, CPARS, Color Review, Discussions, Risk Register, Doctrine, and more have full UI pages and API routes but zero production data. Users see empty states everywhere.
- **Root cause:** These features were built but never populated. Some require n8n workflows to ingest data, others require manual entry. No onboarding or data seeding has occurred.
- **Blast radius:** Users see a mostly-empty application with 42 pages, ~30 of which show "No records found" or empty tables. This undermines trust in the tool.
- **Proposed fix:** Document which tables are expected to be empty (features not yet launched) vs which should have data (features that were supposed to be active). For tables that should have data, investigate why the data pipeline failed.
- **Regression test:** Add health check that counts non-empty tables and alerts if count drops.
- **Fix decision:** `___`
- **Estimated effort:** 2 hours (investigation + documentation)

### STALE-003 — Only 1 of 23 Documents Has Embeddings
- **Severity:** P2
- **Location:** `document_embeddings` table (1 row) vs `knowledge_documents` (23 rows)
- **What's wrong:** Only 1 document has been embedded. The RAG/semantic search feature (`/api/knowledge/search`) falls back to basic text search for 95% of documents.
- **Root cause:** The embedding pipeline (likely triggered via n8n workflow or manual call) was only run for 1 document. No automated embedding on document upload.
- **Blast radius:** Knowledge Base semantic search quality is severely degraded. Users get poor search results.
- **Proposed fix:** Run embedding pipeline for all 23 existing documents. Add automatic embedding trigger on document upload.
- **Regression test:** Assert `COUNT(document_embeddings)` ≥ `COUNT(knowledge_documents)` in health check.
- **Fix decision:** `___`
- **Estimated effort:** 2 hours

### STALE-004 — 11 Environment Variables Undocumented
- **Severity:** P2
- **Location:** `.env.production.example` vs actual `process.env.*` usage
- **What's wrong:** 11 env vars are read in code but not listed in `.env.production.example`: `ANTHROPIC_API_KEY`, `AUTH_REQUIRED`, `BACKUP_DIR`, `DATABASE_URL`, `GOVTRIBE_API_KEY`, `GOVWIN_API_KEY`, `LOG_LEVEL`, `PORT`, `QA_CHECK_TIMEOUT_MS`, `QUALIFY_WRITES_ENABLED`, `UPLOAD_DIR`
- **Root cause:** New features added env var references without updating the example file.
- **Blast radius:** New deployments may miss critical configuration. `DATABASE_URL` in particular is essential and undocumented.
- **Proposed fix:** Add all 11 vars to `.env.production.example` with descriptions.
- **Regression test:** CI check that greps for `process.env.` and compares against `.env.production.example`.
- **Fix decision:** `___`
- **Estimated effort:** 30 min

---

## Category 3: Dead Code

### DEAD-001 — 27 Mock Data Files No Longer Used in Routes
- **Severity:** P3
- **Location:** `packages/backend/src/data/*.ts` (27 files)
- **What's wrong:** 27 mock data files exist but are only imported by `db/seed.ts` (development seeding) and one self-referential mock. No route handler imports mock data anymore.
- **Root cause:** Mock data was the original data source. As DB-backed routes were built, mock imports were removed from routes but the files remain.
- **Blast radius:** None — dead weight. ~5,000 lines of unused code in production builds.
- **Proposed fix:** Move to a `dev/` or `test/` directory, or remove entirely if seed.ts is refactored to use DB fixtures.
- **Regression test:** N/A — these are dead files.
- **Fix decision:** `___`
- **Estimated effort:** 30 min

### DEAD-002 — 77 Zip Files + Legacy Docs in Repo Root
- **Severity:** P3
- **Location:** Repo root — 77 `.zip`, 14 `.xlsx`, 6 `.docx`/`.pdf`, ~7 legacy folders
- **What's wrong:** Build artifacts, old master build spreadsheets, and legacy folders are committed to the repository. This bloats the repo and makes the file tree confusing.
- **Root cause:** Historical build artifacts were committed during early development phases.
- **Blast radius:** Slow clones, confusing repo structure. No functional impact.
- **Proposed fix:** Add these to `.gitignore` and remove from tracked files (preserving git history). Move useful docs to `/docs/archive/`.
- **Regression test:** CI check that repo root contains no `.zip` files.
- **Fix decision:** `___`
- **Estimated effort:** 1 hour

---

## Category 4: Dangerous / Risky Code

### RISK-001 — CORS Allows All Origins
- **Severity:** P0
- **Location:** `packages/backend/src/server.ts:77`
- **What's wrong:** `app.use(cors())` with no configuration allows requests from **any origin**. Any website can make API calls to the backend if they obtain a valid JWT.
- **Root cause:** Default CORS setup was never restricted after development.
- **Blast radius:** Cross-site request attacks possible. Any malicious website visited by a logged-in user could potentially make API calls.
- **Proposed fix:** Configure CORS to allow only `https://gda.csr-llc.tech` and `http://localhost:*` for development:
  ```typescript
  app.use(cors({
    origin: process.env.NODE_ENV === 'production'
      ? ['https://gda.csr-llc.tech']
      : [/localhost/],
    credentials: true
  }));
  ```
- **Regression test:** Assert that requests from `https://evil.com` are rejected with CORS error.
- **Fix decision:** `___`
- **Estimated effort:** 30 min

### RISK-002 — `xlsx` Dependency Has Known HIGH Vulnerability
- **Severity:** P1
- **Location:** `packages/backend/package.json` — `xlsx: ^0.18.5`
- **What's wrong:** The SheetJS `xlsx` library has a known Prototype Pollution vulnerability (GHSA-4r6h-8v6p-xvw6) and a ReDoS vulnerability (GHSA-5pgg-2g8v-p4x9). The library is unmaintained — no fix is available.
- **Root cause:** `xlsx` was chosen for spreadsheet parsing. The library was abandoned by its maintainers.
- **Blast radius:** An attacker could craft a malicious `.xlsx` file and upload it to the document upload endpoint, potentially achieving code execution via prototype pollution.
- **Proposed fix:** Replace `xlsx` with `exceljs` or `sheetjs-ce` (community edition). If spreadsheet parsing is not actively used, remove the dependency.
- **Regression test:** `npm audit` should return 0 HIGH vulnerabilities.
- **Fix decision:** `___`
- **Estimated effort:** 2 hours

### RISK-003 — Webhook Registry Endpoint Publicly Accessible
- **Severity:** P2
- **Location:** `packages/backend/src/server.ts:128-133`
- **What's wrong:** `GET /api/webhooks/registry` is publicly accessible (no auth). It exposes the full list of n8n webhook URLs, their names, and purposes.
- **Root cause:** Intentionally made public for n8n integration, but exposes internal infrastructure details.
- **Blast radius:** An attacker could enumerate all webhook endpoints and attempt to call them directly. n8n webhooks may have their own auth (GDA_WEBHOOK_KEY) but the registry makes discovery trivial.
- **Proposed fix:** Move behind `authMiddleware`. If external access is needed, restrict to a specific API key.
- **Regression test:** Assert unauthenticated request to `/api/webhooks/registry` returns 401.
- **Fix decision:** `___`
- **Estimated effort:** 15 min

### RISK-004 — Health Endpoints Expose Internal Details
- **Severity:** P3
- **Location:** `GET /health` and `GET /health/detailed`
- **What's wrong:** Health endpoints are publicly accessible and expose: Node.js version, process PID, memory usage, uptime, and configuration status of all integrations.
- **Root cause:** Standard health check pattern, but includes too much detail for a public endpoint.
- **Blast radius:** Reconnaissance value for attackers — they learn exact Node version, whether DB is connected, which integrations are configured.
- **Proposed fix:** Keep `/health` public but return only `{status: "ok"}`. Move detailed info to `/health/detailed` behind auth.
- **Regression test:** Assert `/health` response does not contain `nodeVersion` or `pid`.
- **Fix decision:** `___`
- **Estimated effort:** 30 min

---

## Category 5: Data Integrity Issues

### DATA-001 — Duplicate Migration Numbers (4 Pairs)
- **Severity:** P1
- **Location:** `packages/backend/src/db/migrations/`
- **What's wrong:** 4 pairs of migrations share the same number prefix: 036, 038, 039, 040. Each pair contains unrelated schema changes.
- **Root cause:** Parallel development (multiple workstreams) added migrations without coordinating numbers.
- **Blast radius:** On a fresh DB, migration execution order within each pair depends on filesystem sort (which sorts alphabetically after the number). If `036_vehicle_classification.sql` depends on anything from `036_company_entities.sql` (or vice versa), fresh installations may fail.
- **Proposed fix:** Renumber duplicate migrations to have unique sequential numbers. Verify execution order on a fresh database.
- **Regression test:** CI check that asserts no duplicate migration number prefixes exist.
- **Fix decision:** `___`
- **Estimated effort:** 1 hour

### DATA-002 — Missing Migration File (024)
- **Severity:** P1
- **Location:** `schema_migrations` references `024_seed_knowledge_collections.sql` — file not in repo
- **What's wrong:** Migration 024 was applied to production but the `.sql` file was never committed to the repository (or was deleted). This means a fresh database build will skip whatever schema changes were in migration 024.
- **Root cause:** File was either forgotten during commit or deleted during cleanup.
- **Blast radius:** Fresh deployments will be missing whatever schema/data migration 024 provided. If it seeded `knowledge_collections`, the 6 existing rows in that table may not exist on new installations.
- **Proposed fix:** Reconstruct migration 024 from its actual effects on the database (inspect `knowledge_collections` table structure and contents). Re-create the file.
- **Regression test:** CI check that every file referenced in `schema_migrations` exists in the migrations directory.
- **Fix decision:** `___`
- **Estimated effort:** 1 hour

### DATA-003 — Two Migration Tracking Tables
- **Severity:** P2
- **Location:** `_migrations` (22 rows) and `schema_migrations` (46 rows)
- **What's wrong:** Two migration tracking tables exist. The `_migrations` table is from a legacy runner and is no longer actively used.
- **Root cause:** Migration runner was replaced without removing the old tracking table.
- **Blast radius:** Confusion during database audits. No functional impact.
- **Proposed fix:** Verify `_migrations` is not referenced in any code. If confirmed dead, document as legacy and consider dropping.
- **Regression test:** Grep for `_migrations` in codebase — should have 0 references.
- **Fix decision:** `___`
- **Estimated effort:** 30 min

---

## Category 6: Performance Issues

### PERF-001 — SAM Monitor Unpaginated (6,746 Rows in 2.1s)
- **Severity:** P1
- **Location:** `packages/backend/src/routes/sam-monitor.ts`
- **What's wrong:** Returns all SAM opportunities in a single query. Duplicate of BROKEN-002.
- **See:** BROKEN-002

### PERF-002 — Single Frontend Bundle (321 KB gzipped, no code splitting)
- **Severity:** P2
- **Location:** `packages/frontend/vite.config.ts`
- **What's wrong:** The entire frontend (42 pages) is bundled into a single 1.3 MB JS file (321 KB gzipped). Users download all code on first visit regardless of which page they access.
- **Root cause:** Default Vite configuration without route-based code splitting.
- **Blast radius:** Slower initial page load, especially on mobile/slow connections.
- **Proposed fix:** Add route-based lazy loading with `React.lazy()` and `Suspense`.
- **Regression test:** Build output should produce multiple chunk files.
- **Fix decision:** `___`
- **Estimated effort:** 2 hours

### PERF-003 — Recharts (80 KB gzipped) Used in 1 of 36 Pages
- **Severity:** P3
- **Location:** `packages/frontend/package.json` — `recharts: ^3.8.1`
- **What's wrong:** Recharts adds ~80 KB gzipped to the bundle but is only imported in `FinancialBible.tsx`. All other charts use custom SVG.
- **Root cause:** Recharts was added for the Financial Bible page. Other chart pages use inline SVG/HTML.
- **Blast radius:** ~25% of the JS bundle is recharts, loaded on every page even when not needed.
- **Proposed fix:** Lazy-load the FinancialBible page (part of PERF-002). This alone would remove recharts from the initial bundle.
- **Regression test:** Initial chunk should not include recharts.
- **Fix decision:** `___`
- **Estimated effort:** 30 min (if done as part of PERF-002)

---

## Category 7: Inconsistency Issues

### INCON-001 — Frontend Uses Both Inline SVG Charts and Recharts
- **Severity:** P3
- **Location:** `FinancialBible.tsx` (recharts) vs `Charts.tsx`, `Predictive.tsx`, `Home.tsx` (inline SVG)
- **What's wrong:** Two different charting approaches are used: Recharts library in one page, custom inline SVG everywhere else. This creates visual inconsistency and maintenance burden.
- **Root cause:** Different developers/sessions chose different approaches.
- **Blast radius:** Low — visual differences between chart pages. Maintenance burden of supporting two charting systems.
- **Proposed fix:** Standardize on one approach. If recharts stays, use it everywhere. If inline SVG is preferred, migrate FinancialBible.
- **Regression test:** N/A — design decision.
- **Fix decision:** `___`
- **Estimated effort:** 4 hours

---

## Category 8: Observability Gaps

### OBSERVE-001 — 42 Catch Blocks Swallow Errors Without Logging
- **Severity:** P1
- **Location:** Multiple route files (see STATIC_ANALYSIS.md for full list)
- **What's wrong:** 42 `catch` blocks in route handlers catch errors and either do nothing or fall through silently. Errors are invisible to monitoring.
- **Root cause:** Many were intentional "fall through to mock" patterns from early development. The mock imports were removed but the empty catches remain.
- **Blast radius:** Errors in database queries, n8n calls, and data processing are invisible. Issues that should trigger alerts go unnoticed. This is likely why features appear to "work" but show empty data — the queries fail silently.
- **Proposed fix:** Add `log.error()` calls to every catch block. For intentional graceful degradation, add `log.warn()` with the catch reason.
- **Regression test:** Grep for `catch {` and `catch { /* empty */` — count should be 0.
- **Fix decision:** `___`
- **Estimated effort:** 2 hours

### OBSERVE-002 — No n8n Workflow Failure Alerting
- **Severity:** P2
- **Location:** n8n instance at `https://n8n.csr-llc.tech`
- **What's wrong:** No alerts when n8n workflows fail. Failures are only visible by checking the n8n execution history manually.
- **Root cause:** No monitoring integration configured.
- **Blast radius:** Silent failures in data pipelines (SAM.gov ingest, enrichment, search) go unnoticed until users report stale data.
- **Proposed fix:** Add an n8n error handler workflow that sends notifications (Telegram, email, or health check endpoint) on failure. Or add `/health/n8n` endpoint that checks recent execution status.
- **Regression test:** Trigger a deliberate n8n workflow failure and verify alert fires.
- **Fix decision:** `___`
- **Estimated effort:** 2 hours

### OBSERVE-003 — Health Check Doesn't Cover n8n
- **Severity:** P2
- **Location:** `packages/backend/src/server.ts` — `/health` endpoint
- **What's wrong:** The health endpoint checks DB connectivity but not n8n. If n8n is down, the health check still returns "ok."
- **Root cause:** Health check was built before n8n integration.
- **Blast radius:** Monitoring shows "healthy" even when a major integration is down.
- **Proposed fix:** Add n8n connectivity check to `/health` (with timeout so it doesn't block the whole check).
- **Regression test:** Mock n8n as unavailable and verify health check reports degraded.
- **Fix decision:** `___`
- **Estimated effort:** 1 hour

---

## Category 9: Documentation Rot

### DOC-001 — `.env.production.example` Missing 11 Variables
- **Severity:** P2
- **Location:** `.env.production.example`
- **What's wrong:** Duplicate of STALE-004. 11 env vars referenced in code are not documented.
- **See:** STALE-004

### DOC-002 — No API Documentation
- **Severity:** P3
- **Location:** N/A — no API docs exist
- **What's wrong:** No OpenAPI/Swagger spec, no API docs. The only documentation of endpoints is the source code itself.
- **Root cause:** API docs were never created.
- **Blast radius:** Developers (including Devin) must read source code to understand API contracts. Integration with other tools requires trial-and-error.
- **Proposed fix:** Generate an API inventory document (partially done in INVENTORY.md). Consider auto-generating OpenAPI spec.
- **Regression test:** N/A — documentation.
- **Fix decision:** `___`
- **Estimated effort:** 4 hours

---

## Summary by Fix Decision

Shawn: Please review each finding and mark the **Fix decision** column:
- **Fix Now** — will be addressed in Phase 5
- **Fix Later** — logged for future sprint
- **Won't Fix** — accepted risk / by design
- **Document Only** — no code change, just document

| ID | Severity | Summary | Fix Decision |
|----|----------|---------|--------------|
| BROKEN-001 | P0 | Versioning triggers duplicated 3× | `___` |
| STALE-001 | P0 | record_version has 0 rows | `___` |
| RISK-001 | P0 | CORS allows all origins | `___` |
| BROKEN-002 | P1 | SAM monitor unpaginated (2.1s) | `___` |
| STALE-002 | P1 | 41 empty tables with UI pages | `___` |
| RISK-002 | P1 | xlsx has known HIGH vulnerability | `___` |
| DATA-001 | P1 | Duplicate migration numbers | `___` |
| DATA-002 | P1 | Missing migration file (024) | `___` |
| OBSERVE-001 | P1 | 42 catch blocks swallow errors | `___` |
| STALE-003 | P2 | Only 1/23 docs embedded | `___` |
| STALE-004 | P2 | 11 env vars undocumented | `___` |
| BROKEN-003 | P2 | Two migration tracking tables | `___` |
| RISK-003 | P2 | Webhook registry publicly accessible | `___` |
| DATA-003 | P2 | Two migration tracking tables | `___` |
| PERF-002 | P2 | No code splitting (321 KB bundle) | `___` |
| OBSERVE-002 | P2 | No n8n failure alerting | `___` |
| OBSERVE-003 | P2 | Health check doesn't cover n8n | `___` |
| DOC-001 | P2 | .env.example missing 11 vars | `___` |
| DEAD-001 | P3 | 27 mock data files unused | `___` |
| DEAD-002 | P3 | 77 zip files in repo root | `___` |
| RISK-004 | P3 | Health endpoints expose internals | `___` |
| PERF-003 | P3 | Recharts (80KB) used in 1 page | `___` |
| INCON-001 | P3 | Two charting approaches | `___` |
| DOC-002 | P3 | No API documentation | `___` |
