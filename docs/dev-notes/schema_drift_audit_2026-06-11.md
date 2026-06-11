# Schema Drift Audit — 2026-06-11

## Executive Summary

- **Total drift findings:** 14
- **Critical (breaks page/feature at runtime):** 7
- **Warning (silent fail / wrong data):** 5
- **Informational (semantic mismatch, type risk):** 2

---

## Findings

### CRITICAL-1: `contract_number` and `description` on `awards` table
- **File:line:** `apps/backend-v3/src/routes/competitors.ts:165–166`
- **Code references:** `contract_number AS contract_id`, `description AS title` on table `awards`
- **Actual schema:** `awards` has no `contract_number` column (the PIID is stored as `piid`) and no `description` column. The `awards` schema has: `id`, `piid`, `agency_id`, `agency_name`, `contracting_office`, `awardee_name`, `awardee_uei`, `value_obligated`, `value_base_and_all_options`, `naics`, `psc`, `period_of_performance_end`, …
- **Likely cause:** This re-compete contract query was written against an old schema that had these columns before the table was rebuilt to match the USAspending ingest model.
- **User-visible impact:** The "re-compete contracts" section of the Competitor Analysis page (`/competitors`) throws a PostgreSQL `column "contract_number" does not exist` error at runtime, causing the entire `POST /v3/competitors/:name/analyze` route to return 500.
- **Recommended fix:** Replace `contract_number AS contract_id` with `piid AS contract_id` and `description AS title` with `agency_name AS title` (or use `NULL AS title` since there is no description field on awards).

---

### CRITICAL-2: `awardee_uei` on `competitor_analysis_cache`
- **File:line:** `apps/backend-v3/src/routes/competitors.ts:219, 222, 438, 441`
- **Code references:** `INSERT INTO competitor_analysis_cache (competitor_name, awardee_uei, …)` and `DO UPDATE SET … awardee_uei = $2`
- **Actual schema:** `competitor_analysis_cache` has only 6 columns: `id`, `competitor_name`, `competitor_analysis`, `competitor_analysis_run_at`, `expires_at`, `created_at`. There is no `awardee_uei` column.
- **Likely cause:** A column was planned but never migrated, or was dropped without updating the route.
- **User-visible impact:** Every call to `runCompetitorAnalysis()` (invoked from `POST /v3/competitors/:name/analyze` and `POST /v3/competitors/by-id/:id/analyze`) fails with a PostgreSQL column-does-not-exist error after the LLM analysis completes, so the result is never cached and every analysis call re-invokes the LLM.
- **Recommended fix:** Either add `awardee_uei TEXT` to `competitor_analysis_cache` via migration, or remove `awardee_uei` from all INSERT/UPDATE statements in the route.

---

### CRITICAL-3: `document_type`, `status`, `source_url` on `vault_regulatory_catalog`
- **File:line:** `apps/backend-v3/src/routes/digest.ts:254–256` (function `getRegulatoryTracker`, also type declaration at line 55–59)
- **Code references:** `SELECT id, title, document_type, effective_date::text, status, source_url FROM vault_regulatory_catalog`
- **Actual schema:** `vault_regulatory_catalog` has: `id`, `citation`, `title`, `category`, `summary`, `url` (not `source_url`), `effective_date`, `ndaa_year`, `eo_number`, `gao_docket`, `applies_to`, `key_clauses`, `is_active`, `created_at`. It has **no** `document_type`, `status`, or `source_url` columns.
- **Likely cause:** PR #791 redesigned the Vault. The `digest.ts` `getRegulatoryTracker` function was written against an earlier schema (possibly targeting `vault_documents`) and was never updated. The frontend `use-digest.ts:45` also declares `document_type: string | null` for the same stale assumption.
- **User-visible impact:** The Digest / Regulatory Tracker widget (`GET /v3/digest/regulatory-tracker` or the digest summary endpoint that calls `getRegulatoryTracker()`) returns a 500 error. The entire digest summary may be affected depending on whether the error propagates.
- **Recommended fix:** Rewrite the query to use the actual columns: `SELECT id, citation AS title, category AS document_type, effective_date, url AS source_url, NULL AS status FROM vault_regulatory_catalog`. Alternatively add a `status` computed column or drop it from the response type.

---

### CRITICAL-4: `naics_codes` and `incumbent_competitor` on `opportunities`
- **File:line:** `apps/backend-v3/src/routes/captures.ts:573`
- **Code references:** `SELECT title, description, solicitation_number, naics_codes, set_aside, place_of_performance, incumbent_competitor FROM opportunities WHERE id = $1`
- **Actual schema:** `opportunities` has `naics` (singular text column, not an array), `incumbent` (not `incumbent_competitor`), and `solicitation_number`. The columns `naics_codes` and `incumbent_competitor` do not exist.
- **Likely cause:** This query was written against an old opportunities schema that stored NAICS as an array field and had `incumbent_competitor` as a separate column. The schema was later normalized to `naics TEXT` and `incumbent TEXT`.
- **User-visible impact:** `POST /v3/captures/:id/generate-plan` (which triggers the LLM capture plan generation) fails with a PostgreSQL column-does-not-exist error. Generating a capture plan is broken for all opportunities.
- **Recommended fix:** Replace `naics_codes` with `naics`, wrap it as `ARRAY[naics] AS naics_codes` if the downstream code expects an array, and replace `incumbent_competitor` with `incumbent`.

---

### CRITICAL-5: `soak_events` and `soak_metrics` tables do not exist
- **File:line:** `apps/backend-v3/src/routes/soak.ts:42` (INSERT) and `soak.ts:60` (SELECT)
- **Code references:** `INSERT INTO soak_events (kind, url, status, duration_ms, message, api_version)` and `SELECT day, kind, count, p95_ms, api_version FROM soak_metrics`
- **Actual schema:** Neither `soak_events` nor `soak_metrics` exists in the database. Confirmed via `pg_tables` query.
- **Likely cause:** The soak telemetry tables were planned (code was written) but the migrations were never applied.
- **User-visible impact:** `POST /v3/soak-metrics` silently swallows the error (due to a try/catch) so frontend soak events are lost but the endpoint returns 200. `GET /v3/soak-metrics` (used by Sentinel to read performance metrics) returns a 500 error, breaking the Sentinel health dashboard.
- **Recommended fix:** Create and apply a migration that adds both tables. Suggested schema:
  ```sql
  CREATE TABLE soak_events (
    id bigserial PRIMARY KEY,
    kind text NOT NULL,
    url text,
    status int,
    duration_ms int,
    message text,
    api_version text,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE MATERIALIZED VIEW soak_metrics AS
    SELECT date_trunc('day', created_at)::date AS day, kind,
           count(*) AS count,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms,
           api_version
    FROM soak_events
    GROUP BY 1, 2, 4;
  ```

---

### CRITICAL-6: Pipeline page navigates with `internal_id` (UUID) but detail route expects bigint `id`
- **File:line (frontend):** `packages/frontend-v3/src/app/pipeline/page.tsx:471, 518` — `href={\`/opportunities?id=${opp.internal_id}\`}`; also `pipeline/page.tsx:312` and `pipeline/page.tsx:400` (key fallback)
- **File:line (backend):** `apps/backend-v3/src/services/opportunities/index.ts:704–707` — `getOpportunityById` runs `SELECT * FROM opportunities WHERE id = $1` binding the param as a bigint-typed column
- **Code references:** Pipeline page passes `opp.internal_id` (a UUID like `"3f4a2b..."`), but `GET /v3/opportunities/:id` feeds that value directly to `WHERE id = $1` on `opportunities.id` (bigint). PostgreSQL will throw `invalid input syntax for type bigint` for a UUID string.
- **Actual schema:** `opportunities.id` is `bigint`. `unified_opportunities.internal_id` is `uuid`. They are different tables.
- **Likely cause:** The pipeline page was migrated to use `unified_opportunities` rows (which carry `internal_id`) but the `onNavigate` / `href` was not updated to use the unified detail endpoint (`/v3/opportunities/unified/:internal_id`).
- **User-visible impact:** Clicking any opportunity row in the Pipeline page produces a 500 error (PostgreSQL type error) and the opportunity detail panel never loads.
- **Recommended fix:** In `pipeline/page.tsx`, change the detail href to use `/v3/opportunities/unified/${opp.internal_id}` and update `useOpportunity` to call the unified endpoint, OR resolve `internal_id` → `id` server-side and return both in the list response.

---

### CRITICAL-7: Launchpad `top-programs` navigates with `internal_id` to wrong detail route
- **File:line:** `packages/frontend-v3/src/app/launchpad/page.tsx:189` — `href={\`/opportunities?id=${opp.internal_id}\`}` and `packages/frontend-v3/src/app/pipeline/page.tsx:312` (movers panel)
- **Code references:** Same root cause as CRITICAL-6. The launchpad top-programs panel returns `internal_id` (UUID) from `GET /v3/launchpad/top-programs` and the frontend navigates to `?id=<uuid>`.
- **User-visible impact:** Clicking a top-program card from the Launchpad produces a PostgreSQL type error and the detail panel fails to load.
- **Recommended fix:** Same as CRITICAL-6 — route through the unified detail endpoint.

---

### WARNING-1: `document_type` column used on `vault_regulatory_catalog` in frontend type
- **File:line:** `packages/frontend-v3/src/hooks/use-digest.ts:45`
- **Code references:** Interface field `document_type: string | null` declared for the regulatory tracker response
- **Actual schema:** `vault_regulatory_catalog` has `category` (not `document_type`). This mirrors the backend CRITICAL-3 finding.
- **Likely cause:** Frontend type was generated from the old schema before PR #791.
- **User-visible impact:** Even after fixing the backend query, the frontend renders `undefined` for the `document_type` field unless the type is corrected.
- **Recommended fix:** Rename the field to `category` (or keep `document_type` as the API response alias, provided the backend SELECT aliases it appropriately).

---

### WARNING-2: `opportunities.status` aliased as `pipeline_stage` in vehicles route
- **File:line:** `apps/backend-v3/src/routes/vehicles.ts:49`
- **Code references:** `o.status AS pipeline_stage` — aliasing `opportunities.status` (values: `discovery`, `tracking`, `qualifying`, `qualified`, `no_bid`, `closed`, `awarded`) to the field name `pipeline_stage`
- **Actual schema:** The canonical `pipeline_stage` in the rest of the codebase comes from `pipeline_items.stage` (values: `interest`, `qualified`, `bid`, `won`, `no_bid`). These are two entirely different enums.
- **Likely cause:** The vehicles route was written before `pipeline_items` existed; it uses `opportunities.status` as a proxy.
- **User-visible impact:** The Vehicle Opportunities panel shows lifecycle status labels (e.g., "discovery", "qualifying") where the UI expects capture-stage labels (e.g., "interest", "bid"). Coloring/sorting based on pipeline stage will be wrong. Silent data corruption — no error thrown.
- **Recommended fix:** Replace `o.status AS pipeline_stage` with a subquery: `COALESCE((SELECT pi.stage FROM pipeline_items pi WHERE pi.opportunity_id = o.id ORDER BY pi.id DESC LIMIT 1), 'interest') AS pipeline_stage`.

---

### WARNING-3: `GET /v3/opportunities/:id` does not handle UUID `internal_id` — capture page also affected
- **File:line:** `packages/frontend-v3/src/app/capture/page.tsx:130, 135, 224`
- **Code references:** `href={\`/capture?opp=${item.internal_id}\`}` and `<option value={item.internal_id}>`
- **Actual schema:** The capture API likely looks up by bigint opportunity id or pipeline_item id; using `internal_id` (UUID) may silently fail or cast wrong.
- **Likely cause:** Capture page was partially migrated to use `unified_opportunities` internal_id keys.
- **User-visible impact:** Selecting an opportunity in the capture dropdown may submit a UUID where a bigint is expected.
- **Recommended fix:** Audit the `/capture` page API call to confirm what id type the endpoint expects and ensure the correct id is passed.

---

### WARNING-4: USAspending NAICS filter includes non-NAICS GSA SIN codes
- **File:line:** `apps/backend-v3/src/ingest/usaspending/client.ts:176`
- **Code references:** `naics_codes: [...ENVISION_NAICS]` — spreads the full `ENVISION_NAICS` constant (18 codes) into the USAspending API filter body
- **Actual schema (API contract):** USAspending's `spending_by_award` endpoint expects `naics_codes` to contain standard 6-digit numeric NAICS codes. `ENVISION_NAICS` includes two non-numeric GSA Schedule SIN identifiers: `"54151S"` and `"54151HACS"`. The USAspending API returns HTTP 422 or silently ignores invalid codes, causing the filter to drop records that would have been returned under those SINs (GSA IT services awards).
- **Likely cause:** `ENVISION_NAICS` is used across SAM.gov filtering, prompt context, and USAspending. The GSA SINs are valid for SAM.gov but not for USAspending's NAICS filter.
- **User-visible impact:** USAspending award ingestion may return an error or miss GSA-schedule awards under the `54151S` / `54151HACS` SINs — competitor intelligence for GSA awards would be incomplete. Silent data gap.
- **Recommended fix:** In `client.ts`, filter `ENVISION_NAICS` to only include 6-digit numeric codes before passing to the API filter: `naics_codes: [...ENVISION_NAICS].filter(code => /^\d{6}$/.test(code))`.

---

### WARNING-5: `analysis_jobs` table exists in schema with zero application callers
- **File:line:** `apps/backend-v3/src/workers/analysis.ts` (does not reference the table), various analysis enqueue paths
- **Code references:** Zero calls to INSERT/SELECT/UPDATE on `analysis_jobs` in any application code. References exist only in migration files, schema audit tests, and documentation.
- **Actual schema:** `analysis_jobs` table exists with full schema (pgboss_job_id, queue_name, entity_type, entity_id, priority, status, retry_count, etc.)
- **Likely cause:** This was designed as a pg-boss companion table but actual job tracking was implemented entirely through pg-boss's own `pgboss.*` schema. The `analysis_jobs` table was never wired up.
- **User-visible impact:** None currently — the table is dead weight. However any monitoring or admin UI that queries `analysis_jobs` expecting job records will always show empty results.
- **Recommended fix:** Either wire up the table (insert a tracking row on every `enqueueAnalysis` call) or drop it with a migration if it will never be used.

---

### INFO-1: `awards.linked_opportunity_id` is `integer` but `opportunities.id` is `bigint`
- **File:line:** `apps/backend-v3/src/ingest/usaspending/job.ts` (writes the link), schema
- **Code references:** Foreign key `awards_linked_opportunity_id_fkey` references `opportunities(id)` but the column type is `integer` (max ~2.1B) vs `bigint` (max ~9.2 quintillion)
- **Actual schema:** `opportunities.id` is `bigint` (sequence currently at max 133,564). `awards.linked_opportunity_id` is `integer`.
- **Likely cause:** Type mismatch from an early migration that was not corrected.
- **User-visible impact:** None currently — opportunity IDs are well within integer range. Risk becomes real if the `opportunities.id` sequence ever exceeds ~2.1 billion, which would cause FK insertions to silently truncate or throw a cast error.
- **Recommended fix:** `ALTER TABLE awards ALTER COLUMN linked_opportunity_id TYPE bigint;`

---

### INFO-2: `vault_documents.linked_opportunity_id` and `linked_capture_id` are `integer` vs parent `bigint`/`bigint`
- **File:line:** `vault_documents` table schema
- **Code references:** `vault_documents.linked_opportunity_id integer` references `opportunities.id bigint`; `linked_capture_id integer` references `captures.id bigint`
- **Actual schema:** Same pattern as INFO-1. Column types are `integer` (4-byte) while the parent tables use `bigint` (8-byte) primary keys.
- **User-visible impact:** None currently at present data volumes.
- **Recommended fix:** Migrate both columns to `bigint` as a precaution.

---

## The Two-ID-System Architecture

### Row counts (as of 2026-06-11)
| Table | Count |
|---|---|
| `opportunities` (bigint `id`) | 15,488 |
| `unified_opportunities` (uuid `internal_id`) | 15,488 |

Both tables have the same row count. Every `unified_opportunities` row has at least one `unified_opportunity_links` entry.

### Sync mechanism
There are **no database triggers**. Sync is performed in code:
- `apps/backend-v3/src/services/opportunities/unified-mirror.ts` — `mirrorToUnified()` — called from the ingest framework (`source_writer.ts`) each time an opportunity is upserted. It looks up an existing `unified_opportunity_links` row for the same source/native_id; if found, it UPDATEs the `unified_opportunities` row; if not found, it INSERTs a new `unified_opportunities` row and a new `unified_opportunity_links` row.
- `unified_opportunity_links` tracks which source (sam, govtribe, govwin, etc.) and `source_native_id` maps to each `internal_id`. One `unified_opportunities` row can have multiple links (e.g., same opportunity sourced from both SAM and GovTribe).

### `unified_opportunity_links` source breakdown (live data)
| source | count |
|---|---|
| sam | 13,557 |
| govtribe | 154 |
| govwin | 155 |
| arxiv | 600 |
| dod_rss | 39 |
| grants_gov | 612 |
| sbir | 167 |
| nih | 204 |

### Which routes use which table

**`opportunities` (bigint `id`) — legacy/authoritative record store:**
- `GET /v3/opportunities` (list) — `apps/backend-v3/src/services/opportunities/index.ts`
- `GET /v3/opportunities/:id` (detail, analyze-on-read) — `routes/opportunities.ts`
- `PATCH /v3/opportunities/:id` (stage update) — `routes/opportunities.ts`
- `GET /v3/opportunities/:id/analysis-status` — `routes/opportunities.ts`
- `POST /v3/competitors/:name/analyze` — reads `awards` (competitor stats), does not read opportunities directly for analysis
- `POST /v3/captures/:id/generate-plan` — `routes/captures.ts` (currently broken, see CRITICAL-4)
- `GET /v3/vehicles/:vehicleId/opportunities` — `routes/vehicles.ts` via JOIN on `opportunity_vehicle_links`
- All `opportunity_analysis_cache`, `pipeline_items`, `pwin_features`, `pwin_outcomes` — keyed on either bigint `opportunity_id` (analysis cache, pipeline_items) or uuid `opportunity_id` (pwin_features → unified internal_id)
- `daily_briefing/assemble.ts` — queries `opportunities` directly for open/at-risk opps

**`unified_opportunities` (uuid `internal_id`) — canonical merged view (newer):**
- `GET /v3/opportunities/unified` (list with lifecycle_stage filter) — `routes/opportunities.ts`
- `GET /v3/opportunities/unified/:internal_id` (merged detail) — `routes/opportunities.ts`
- `POST /v3/opportunities/unified/:internal_id/analyze` — `routes/opportunities.ts`
- `GET /v3/launchpad/top-programs` — `routes/launchpad.ts`
- `GET /v3/opportunities/:internal_id/field-override` — `routes/opportunities.ts` (uses `internal_id` param)
- pwin batch scorer — writes `pwin` back to `unified_opportunities`
- `services/opportunities/match-suggestions.ts` — reads `unified_opportunity_links` + `unified_opportunities`

**Frontend pages and which ID they use:**
| Page | ID used in href/API call |
|---|---|
| `/opportunities` | `opp.id` (bigint) via `OpportunityRow` → `GET /v3/opportunities/:id` ✅ |
| `/pipeline` | `opp.internal_id` (UUID) → `GET /v3/opportunities/:id` ❌ (CRITICAL-6) |
| `/launchpad` | `opp.internal_id` (UUID) → `GET /v3/opportunities/:id` ❌ (CRITICAL-7) |
| `/capture` | `item.internal_id` (UUID) → unclear endpoint (WARNING-3) |
| `/opportunities` (vehicle sub-rows) | `opp.id` (bigint) ✅ |

### Which is authoritative, which is half-migrated?

`opportunities` (bigint) is the **write-authoritative** source of truth. All ingest paths write here first. The `unified_opportunities` (uuid) is the **read-optimized canonical view** assembled by the mirror service. Pwin scores and doctrine_status are written back to `unified_opportunities` independently.

The system is **half-migrated**:
- The `/pipeline`, `/launchpad`, and `/capture` pages were updated to use `internal_id` keys, but they navigate to the legacy `GET /v3/opportunities/:id` (bigint) detail endpoint instead of the unified endpoint.
- The `/opportunities` list page correctly uses bigint `opp.id`.
- There is no deprecation path documented in code for the legacy endpoint.

---

## Tables With No Callers

The following tables exist in the schema but have zero `INSERT`/`SELECT`/`UPDATE` calls in any application code (`apps/backend-v3/src/`):

| Table | Notes |
|---|---|
| `soak_events` | **Does not exist in DB** — code tries to write/read it (see CRITICAL-5) |
| `soak_metrics` | **Does not exist in DB** — code tries to read it (see CRITICAL-5) |
| `analysis_jobs` | Exists in DB; zero app callers. pg-boss companion table never wired up (see WARNING-5) |
| `govtribe_auth_state` | Exists in DB; zero references anywhere in application code or ingest |
| `sbir_award_amount_sources` | Exists in DB; only defined in migrations. SBIR ingest uses `upsertExternalOpportunity` which does not write to per-field source tables for SBIR |
| `sbir_award_awardee_sources` | Same as above |
| `sbir_award_topic_sources` | Same as above |
| `sbir_topic_close_date_sources` | Same as above |
| `sbir_topic_title_sources` | Same as above |

The 5 SBIR `*_sources` tables exist in the schema but the SBIR ingest job routes through `upsertExternalOpportunity` (which writes to the `opportunities` table and `opportunity_*_sources` tables), not the dedicated SBIR per-field sources tables. These are dead schema.

---

## Code Paths With No Schema Backing

| Issue | File | Missing |
|---|---|---|
| `soak_events` INSERT | `routes/soak.ts:42` | Table does not exist |
| `soak_metrics` SELECT | `routes/soak.ts:60` | Table does not exist |

All other tables referenced in code exist in the schema. The `pgboss.job` reference in `routes/opportunities.ts:881` is wrapped in a try/catch and accesses the `pgboss` schema (managed by the pg-boss library at runtime), not a missing application table.

---

## Already-Known Findings Confirmation

1. **`competitors.ts:130` — `contract_number`**: Confirmed. The re-compete contracts query at line 163–178 references `contract_number` and `description` on `awards`. Both columns are absent from the `awards` schema. Documented as **CRITICAL-1** above.

2. **`competitors.ts:315` — `awardee_uei` on `competitor_analysis_cache`**: Confirmed. Lines 219, 222, 438, 441 all reference `awardee_uei` in INSERT/UPDATE on `competitor_analysis_cache` which has no such column. Documented as **CRITICAL-2** above.

3. **`digest.ts` — `document_type` / PR #791**: Confirmed. `getRegulatoryTracker()` at line 252–261 selects `document_type`, `status`, `source_url` from `vault_regulatory_catalog`, none of which exist on that table. Source file is `apps/backend-v3/src/routes/digest.ts`. Documented as **CRITICAL-3** above.

4. **USAspending NAICS stringified array**: The specific "Python-style `['488111', ...]` string" form was not found. The actual issue in `apps/backend-v3/src/ingest/usaspending/client.ts:176` is that `naics_codes: [...ENVISION_NAICS]` includes the non-numeric GSA SIN codes `"54151S"` and `"54151HACS"`, which the USAspending API does not accept as valid NAICS codes. This causes the API to reject or silently drop results for those SINs. Documented as **WARNING-4** above.

5. **Daily briefing LLM Markdown instead of JSON**: The `daily_briefing` system prompt at `apps/backend-v3/src/lib/providers/anthropic.ts:81` says `"return ONLY a JSON object … (no extra keys, no markdown)"`. The `parseJsonResponse` function in `llm-router.ts:151–175` does attempt to strip markdown fences. However, there is **no schema validation** of the parsed output — if the LLM returns Markdown prose instead of JSON, `parseJsonResponse` will either return incorrect data (via the brace-extraction fallback) or throw a `SyntaxError` that propagates to the caller as an unhandled promise rejection, crashing the briefing generation. The route at `routes/briefing.ts` has no try/catch around `assembleDailyBriefing()`, so a JSON parse failure will return a 500 to the client. The root cause is: (a) the system prompt does not use Anthropic's structured JSON output mode (`tool_use`/`tools` parameter), relying only on text instructions; and (b) there is no post-parse schema validation to detect when the LLM returns an object missing required fields (`headline`, `priority_actions`, etc.).
