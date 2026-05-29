# Phase 1 — V3 Test Strategy & CI Pipeline Design

**Program:** Backend V3 rebuild — F-V3-PROGRAM tracker (#384)
**Phase:** 1 — Design
**Date:** 2026-05-29
**Status:** Draft — awaiting human sign-off before any Phase 2 code
**Canonical inputs:** `phase-0-legacy-audit.md`, `phase-0-prod-verification-addendum.md`, `phase-0-scope-correction.md`, `product_rules.md`

> **Scope lock (from `phase-0-scope-correction.md`):** GDA Command is a single-tenant Envision tool. Tests that exercise `ou_tag` filtering or partner browsing must fail to compile. Any test importing `ou_tag`, `ou_registry`, or standalone partner browse endpoints is a test error, not a feature.

---

## 1. Failure modes V3 CI must prevent

Every row below maps a real production break documented in Phase 0 to the CI mechanism that would have caught it. Root cause only — no vibes-based checkboxes.

| # | Real prod break (Phase 0 ref) | Detection mechanism in V3 CI |
|---|---|---|
| F1 | Migrations 127–134 silently failed — dual tracker (`schema_migrations` 128 rows + `_migrations` 22 rows) swallowed them (addendum §Verified migration tracker state) | **Prod-shape migration replay** — CI applies all V3 migrations against a sanitized prod snapshot and asserts a single canonical tracker with zero drift (see §3) |
| F2 | `ou_tag` column missing in prod but referenced in Sprint 2/3 route code — every Pipeline/Capture/Partner Intel/Action Items view returned HTTP 500 (addendum §Critical deltas) | **Schema drift detector** — every PR compares `pg_dump --schema-only` of migration-built DB vs. main-built DB; column/table mismatches fail the PR (see §4) |
| F3 | 63 n8n shadow tables (`gda_*` prefix) created outside migration system via direct DDL — invisible to migration runner (audit §3.2, §6.1) | **Drift detector flags undeclared tables** — CI asserts every `public.*` table is declared in a migration file; undeclared tables fail the build (see §4) |
| F4 | `.env.bak.f020-broken` and two other credential backup files leaked to VPS filesystem (addendum §Confirmed legacy env backup leakage) | **Pre-deploy secret scan** — gitleaks or trufflehog runs on every commit; `.env*` file presence check blocks deploy (see §9) |
| F5 | Frontend Sprint 2/3 pages call endpoints (`/api/opportunities-v2`, `/api/pipeline-v2`, `/api/partner-intel`, `/api/captures`, `/api/action-items`) that return 500 because backing tables do not exist in prod (addendum §TL;DR) | **Contract tests** — every PR runs the V3 API against every endpoint defined in `openapi-v3.yaml`; response schema drift fails the PR (see §5) |
| F6 | R1 violations: `captures`, `teaming_flags`, `partner_awards`, `partner_news_items`, `partner_intel_profiles` have no source columns; values rendered without citation (audit §7.1) | **R1 source-coverage gate** — CI asserts every fact table row inserted must have source attribution; source coverage % reported per PR (see §6) |
| F7 | R2 violations: Sprint 2 `GET /api/opportunities-v2/:id` returns data without triggering auto-analysis; "pending analysis" responses possible (audit §7.2) | **R2 auto-analysis gate** — every detail endpoint tested: calling it on a freshly-created record must return analysis populated within SLA; no "pending analysis" allowed (see §7) |
| F8 | Dual migration tracker root cause: runner changed between deployments, wrote to one table while checking the other (addendum §Verified migration tracker state) | **Single tracker assertion** — CI counts migration tracker tables in the V3 DB; >1 tracker fails the build (see §3, §4) |
| F9 | Three competing opportunity tables in prod (`sam_opportunities` 20,062 rows, `gda_opportunity_tracker` 1,924 rows, `opportunities` 658 rows) with incompatible schemas (addendum §Top-10 largest tables) | **Parity report in prod-shape replay** — migration replay asserts exactly one canonical `opportunities` table with the V3 schema; legacy tables archived, not live (see §3) |
| F10 | n8n webhook payloads assumed stable but no contract enforcement — payload shape changes break silently (audit §5.3, §5.4) | **n8n contract tests** — every webhook endpoint V3 exposes has a contract test asserting the payload shape n8n sends (see §8) |

---

## 2. Test pyramid for V3

Listed from fastest/cheapest (base) to slowest/most expensive (top).

| Layer | Tool | Scope | Trigger | Target time |
|---|---|---|---|---|
| **Unit** | Vitest | Per module, no DB, no network. Pure function logic, transformers, validators, envelope formatting. | Every PR | < 30 s |
| **Integration** | Vitest + Testcontainers (Postgres) | Per route. Real Postgres in container, real query execution. Tests Express route → DB round-trip. | Every PR | < 3 min |
| **Schema drift** | `pg_dump` diff (custom script) | Compares migration-built schema vs. main-built schema. | Every PR | < 30 s |
| **Prod-shape migration replay** | CI step with sanitized snapshot | Applies V3 migrations against sanitized prod snapshot. Asserts success + parity. | Every PR touching `migrations/` | < 2 min |
| **Contract** | Vitest + supertest against OpenAPI | Validates every V3 endpoint response against `openapi-v3.yaml`. | Every PR | < 2 min |
| **R1 source-coverage** | Vitest + DB constraints | Asserts source attribution on all fact table inserts. Reports coverage %. | Every PR | < 1 min |
| **R2 auto-analysis** | Vitest + integration | Asserts detail endpoints return analysis without explicit trigger. | Every PR | < 1 min |
| **n8n contract** | Vitest + fixture payloads | Validates webhook payload shapes against recorded fixtures. | Every PR | < 30 s |
| **Envision-only scope guard** | TypeScript compiler + grep | `ou_tag` / `ou_registry` / partner-browse imports fail to compile. | Every PR | < 10 s |
| **E2E** | Playwright against frontend | Full browser tests against running frontend + backend + Postgres. | Nightly + on cutover | < 10 min |

**Total PR gate time target: < 10 min.**

---

## 3. Prod-shape migration replay (the key fix)

This is the mechanism that would have caught failures F1, F8, and F9.

### 3.1 What it does

1. CI downloads a **sanitized snapshot** of the legacy prod database (structurally identical, PII stripped).
2. CI stands up a fresh Postgres container from the snapshot.
3. CI applies **all V3 migrations** on top of the snapshot.
4. CI runs the **data import script** (Phase 4 deliverable) against the migrated snapshot.
5. CI asserts:
   - Migration runner exits 0 (no failures).
   - Exactly **one** migration tracker table exists (`schema_migrations`). If a second tracker (`_migrations` or any other) is detected, the build fails immediately.
   - Applied migration count matches files on disk.
   - Schema drift is zero (see §4).
   - Parity report passes: canonical `opportunities` table has the V3 schema, no legacy text-PK `opportunities` table active.

### 3.2 Sanitized snapshot specification

| Aspect | Detail |
|---|---|
| **Source** | Automated `pg_dump --format=custom` of prod `gda_command` database |
| **Refresh cadence** | Weekly (Sunday 02:00 UTC), automated via scheduled CI job |
| **Storage** | Dedicated S3 bucket (`gda-v3-ci-snapshots`) with restricted IAM access (CI role read-only, snapshot-builder role write-only) |
| **Retention** | Last 4 snapshots retained; older snapshots auto-expired via S3 lifecycle policy |
| **Sanitization rules** | See table below |

#### Columns sanitized

| Table | Column(s) | Sanitization method |
|---|---|---|
| `users` | `email`, `display_name` | SHA-256 hash with static salt (preserves uniqueness, destroys PII) |
| `contacts` | `email`, `phone`, `name` | SHA-256 hash |
| `gda_contacts` | `email`, `phone`, `name` | SHA-256 hash |
| `email_log` | `recipient`, `subject`, `body` | Truncated to empty string |
| `gda_chat_history` | `message`, `response` | Truncated to empty string |
| `knowledge_documents` | `content` | Truncated to first 50 chars (preserves schema test, strips content) |
| `document_embeddings` | `embedding` | Zeroed vector (preserves dimension, strips semantic content) |
| `gda_embeddings` | `embedding` | Zeroed vector |
| All tables | Any column named `*_key`, `*_secret`, `*_token`, `*_password` | Replaced with `SANITIZED` |

All other columns (IDs, timestamps, status enums, NAICS codes, agency names, solicitation numbers, dollar values) are **retained** — they are not PII and are required for structural fidelity.

### 3.3 Snapshot refresh workflow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Scheduled CI job │────>│ SSH to prod VPS   │────>│ pg_dump --Fc    │
│ (Sunday 02:00)   │     │ (read-only role)  │     │ gda_command     │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          v
                                              ┌──────────────────────┐
                                              │ Run sanitization SQL │
                                              │ against dump in temp │
                                              │ container            │
                                              └──────────┬───────────┘
                                                          │
                                                          v
                                              ┌──────────────────────┐
                                              │ pg_dump sanitized DB │
                                              │ → upload to S3       │
                                              │ gda-v3-ci-snapshots/ │
                                              └──────────────────────┘
```

---

## 4. Schema drift detector

This is the mechanism that would have caught failures F2, F3, and F8.

### 4.1 How it works

Every PR runs two parallel Postgres containers:

1. **Migration-built**: Fresh Postgres, apply all V3 migration files sequentially.
2. **Main-built**: Fresh Postgres, apply all migration files from the `main` branch.

CI runs `pg_dump --schema-only` on both, then diffs:

```
diff <(pg_dump --schema-only migration_db | sort) \
     <(pg_dump --schema-only main_db | sort)
```

### 4.2 Assertion rules

| Condition | Result |
|---|---|
| Diff is empty | Pass (no schema change in this PR — expected for non-migration PRs) |
| Diff contains only the new migration's expected additions (tables, columns, indexes) | Pass |
| Diff contains unexpected additions, removals, or modifications | **Fail** — developer must explain or fix |
| More than one table named `*_migrations*` or `schema_migrations*` exists | **Fail** — single tracker rule violated |
| Any table in `public.*` exists that is NOT declared in any migration file | **Fail** — undeclared table (catches n8n shadow DDL) |

### 4.3 Undeclared table detection

CI extracts all `CREATE TABLE` target names from migration files and compares against `\dt public.*` output. Any table present in the database but absent from migration files is flagged:

```
DRIFT ERROR: Table 'gda_mega_cache' exists in database but is not
declared in any migration file. All schema changes must go through
the V3 migration system.
```

This directly prevents a recurrence of the 63-shadow-table problem.

---

## 5. Contract tests

This is the mechanism that would have caught failure F5.

### 5.1 How they work

Every PR:

1. CI starts the V3 API server against a Testcontainers Postgres (seeded with fixtures).
2. CI reads `openapi-v3.yaml` and extracts every defined endpoint + response schema.
3. For each endpoint, CI sends the documented request and validates the response against the OpenAPI schema.
4. Any drift between actual response and spec **fails the PR**.

### 5.2 What is validated

| Check | Detail |
|---|---|
| Status codes | Actual status matches spec for success and documented error cases |
| Response body shape | Every required field present, correct type, no undocumented fields |
| GDA Envelope compliance | Every response wrapped in `{ success, workflow, action, dryRun, data, meta, error }` |
| Content-Type | `application/json` for all API responses |
| Auth enforcement | Unauthenticated requests return 401, not 500 |

### 5.3 Envision-only scope guard (compile-time)

The following patterns must **fail to compile** in the V3 codebase:

| Pattern | Detection |
|---|---|
| `import` or `require` referencing `ou_tag` | TypeScript path alias `@gda/shared` must not export `ou_tag` type |
| `import` or `require` referencing `ou_registry` | Same — type must not exist |
| Route handler for `GET /api/v3/partner-intel/*` (except `GET /api/v3/partners/:id`) | Route file must not exist; CI grep confirms |
| Route handler for `GET /api/v3/partner-awards` | Route file must not exist |
| Route handler for `GET /api/v3/partner-news` | Route file must not exist |
| Any `?ou_tag=` query parameter in route code | CI grep for `ou_tag` in `packages/backend/src/routes/` — zero matches required |

Implementation: a CI step runs `grep -rn 'ou_tag\|ou_registry\|partner-intel\|partner-awards\|partner-news' packages/backend/src/routes/ packages/shared/src/` and asserts zero matches (excluding this test strategy doc and explicitly allowed `partners/:id` lookup route).

---

## 6. R1 source-coverage CI

This is the mechanism that would have caught failure F6.

### 6.1 Database-level enforcement

Every V3 fact table must have a `NOT NULL` constraint (or `CHECK` constraint) on its source attribution column(s). The canonical pattern:

```sql
-- Every fact table row must have source attribution
source_kind  TEXT NOT NULL,          -- one of: sam_gov, fpds, usaspending, govwin, news, doctrine, partner_site, internal
source_url   TEXT NOT NULL DEFAULT '',
source_title TEXT NOT NULL DEFAULT ''
```

**CI test**: For every fact table, attempt to `INSERT` a row with `source_kind = NULL`. The insert **must fail** at the database constraint level. If it succeeds, the test fails.

### 6.2 API-level enforcement

For every list endpoint, CI asserts:

- Every object in the response array includes `_sources` siblings on every sourced field.
- No field value is returned without a corresponding `SourceRef` (`kind`, `title`, `url`, `retrieved_at`).
- If a field has no source, the API omits it from the response (per `product_rules.md` R1).

### 6.3 Report card

Every PR generates a source coverage report:

```
R1 Source Coverage Report
─────────────────────────
opportunities     ██████████ 100%  (18/18 fields sourced)
pipeline_items    ██████████ 100%  (10/10 fields sourced)
captures          ██████████ 100%  (11/11 fields sourced)
action_items      ████████░░  80%  (10/13 fields — 3 system-generated, exempt)
─────────────────────────
Overall: 98% (49/52 sourceable fields)
Gate: PASS (threshold: 95%)
```

If overall source coverage drops below **95%**, the PR fails.

---

## 7. R2 auto-analysis CI

This is the mechanism that would have caught failure F7.

### 7.1 Test procedure

For every detail endpoint (e.g., `GET /api/v3/opportunities/:id`):

1. CI creates a fresh record via `POST` with minimal valid fields.
2. CI calls `GET /api/v3/opportunities/:id` (the detail endpoint).
3. CI asserts:
   - Response includes populated `analysis` object (pwin, incumbent, competitors, blackhat, wargame, timeline).
   - No field in the analysis object is `null`, `"pending"`, or `"not_yet_analyzed"`.
   - Response time is within the defined SLA (initial target: 10 seconds for first analysis, < 500 ms for cached).
4. If any analysis field is missing or shows a pending state, the test **fails**.

### 7.2 SLA enforcement

| Scenario | Max response time | Enforcement |
|---|---|---|
| First detail open (cold cache) | 10 s | CI test with fresh record; assert analysis populated within timeout |
| Subsequent detail open (warm cache) | 500 ms | CI test re-fetches same record; assert cache hit |
| Analysis after record update | 10 s | CI updates record, re-fetches, asserts re-analysis triggered |

### 7.3 What "populated" means

The `analysis` object must include at minimum:

```json
{
  "pwin": { "score": <number>, "evidence": <string>, "_source": { ... } },
  "incumbent": { "name": <string>, "_source": { ... } },
  "competitors": [ ... ],
  "timeline": { ... }
}
```

Empty arrays are acceptable for `competitors` if the analysis ran and found none. `null` values are never acceptable — they indicate analysis did not run.

---

## 8. n8n contract tests

This is the mechanism that would have caught failure F10.

### 8.1 Webhook endpoints V3 exposes (n8n → V3)

For each ingest endpoint, a contract test validates:

| Endpoint | Fixture | Assertion |
|---|---|---|
| `POST /api/ingest/opportunities` | `tests/fixtures/n8n/ingest-opportunity.json` | 200 + record upserted |
| `POST /api/ingest/fpds` | `tests/fixtures/n8n/ingest-fpds.json` | 200 + award recorded |
| `POST /api/ingest/intel` | `tests/fixtures/n8n/ingest-intel.json` | 200 + intel item created |
| `POST /api/ingest/sam-opportunities` | `tests/fixtures/n8n/ingest-sam.json` | 200 + SAM record upserted |
| `POST /api/ingest/competitor-movements` | `tests/fixtures/n8n/ingest-competitor.json` | 200 + movement logged |
| `POST /api/ingest/govtribe` | `tests/fixtures/n8n/ingest-govtribe.json` | 200 + record upserted |
| `POST /api/ingest/govwin` | `tests/fixtures/n8n/ingest-govwin.json` | 200 + record upserted |

### 8.2 Webhook endpoints n8n exposes (V3 → n8n)

For each outbound webhook call, a contract test validates the **request shape** V3 sends:

| n8n webhook | Fixture | Assertion |
|---|---|---|
| `gda-opp-tracker` | `tests/fixtures/n8n/call-opp-tracker.json` | Request body matches expected shape |
| `gda-pipeline` | `tests/fixtures/n8n/call-pipeline.json` | Request body matches expected shape |
| `gda-launchpad` | `tests/fixtures/n8n/call-launchpad.json` | Request body matches expected shape |
| `gda-opportunity-detail` | `tests/fixtures/n8n/call-opp-detail.json` | Request body matches expected shape |
| `gda-capture-plan` | `tests/fixtures/n8n/call-capture-plan.json` | Request body matches expected shape |
| `gda-platform-health` | `tests/fixtures/n8n/call-platform-health.json` | Request body matches expected shape |

### 8.3 Fixture management

- Fixtures are recorded from live n8n traffic (sanitized) and committed to `tests/fixtures/n8n/`.
- When an n8n workflow changes, the fixture must be updated in the same PR — contract test catches the mismatch before deploy.
- Fixture schema is validated against a JSON Schema definition co-located with the fixture.

---

## 9. Pre-deploy checks

This is the mechanism that would have caught failure F4.

| Check | Tool | Trigger | Failure behavior |
|---|---|---|---|
| **Secret scanner** | gitleaks (preferred) or trufflehog | Every commit (pre-commit hook + CI) | Block merge; author must rotate leaked credential |
| **`.env*` file presence** | Custom CI step: `find . -name '.env*' -not -name '.env.example' -not -path '*/node_modules/*'` | Every PR | Block merge if any `.env*` file (other than `.env.example`) is committed |
| **Image vulnerability scan** | Trivy or Grype against Docker image | Every build of prod Docker image | Block deploy for CRITICAL/HIGH CVEs; MEDIUM logged as warning |
| **Bundle size budget (frontend)** | `vite-plugin-bundle-analyzer` or `size-limit` | Every PR touching `packages/frontend/` | Block merge if total JS bundle exceeds budget (initial budget: 500 KB gzipped) |
| **Dependency audit** | `npm audit --production` | Every PR | Block merge for critical severity; warn for high |

---

## 10. CI pipeline stage map

### 10.1 PR lifecycle

```
PR opened (draft or ready)
│
├─ Stage 1: FAST FEEDBACK (< 2 min)
│  ├── Lint (ESLint + Prettier)
│  ├── TypeScript typecheck (all workspaces)
│  ├── Unit tests (Vitest, no DB)
│  ├── Envision-only scope guard (grep for forbidden patterns)
│  └── Secret scan (gitleaks)
│
├─ Stage 2: FULL COVERAGE (< 10 min, runs on "ready for review")
│  ├── Integration tests (Vitest + Testcontainers Postgres)
│  ├── Schema drift detector
│  ├── Contract tests (OpenAPI validation)
│  ├── R1 source-coverage gate
│  ├── R2 auto-analysis gate
│  ├── n8n contract tests
│  ├── Prod-shape migration replay (if PR touches migrations/)
│  └── Bundle size check (if PR touches frontend/)
│
└─ All checks pass → PR is mergeable
```

### 10.2 Post-merge lifecycle

```
Merge to main
│
├─ Build Docker images (backend + frontend)
├─ Image vulnerability scan (Trivy)
├─ Deploy to staging
├─ Staging smoke tests (health endpoint + critical path)
│
├─ Human-gated promotion
│  └── Shawn reviews staging → approves prod deploy
│
└─ Deploy to prod
   ├── Post-deploy health check
   └── Rollback trigger if health check fails (< 5 min)
```

### 10.3 Cutover pipeline (V3 launch)

```
V3 staging burn-in (24 hours)
│
├─ Full E2E suite (Playwright) runs every 4 hours during burn-in
├─ Source coverage and analysis SLA monitored continuously
├─ Legacy and V3 running in parallel, same DB (read-only for legacy)
│
├─ Human-gated cutover
│  └── Shawn reviews burn-in metrics → approves frontend env var flip
│
├─ Frontend env var flip (VITE_API_BASE → V3 endpoint)
│
├─ 30-day soak period
│  ├── Legacy endpoints remain available as fallback
│  ├── V3 telemetry monitored for regressions
│  └── E2E suite continues nightly
│
└─ Legacy decommission
   ├── Legacy routes removed from Express
   ├── Legacy tables archived (pg_dump to S3)
   └── Legacy migration files moved to archive/
```

---

## 11. Test data strategy

### 11.1 Fixture organization

```
tests/
├── fixtures/
│   ├── opportunities/
│   │   ├── valid-envision-opp.json        # Minimal valid Envision opportunity
│   │   ├── full-envision-opp.json         # All fields populated with sources
│   │   └── opp-with-teaming.json          # Opportunity with teaming_partners attached
│   ├── pipeline/
│   │   ├── qualified-item.json            # Pipeline item past qualification gate
│   │   └── item-with-evidence.json        # Pipeline item with win_prob_evidence
│   ├── captures/
│   │   ├── capture-with-compliance.json   # Capture with compliance items
│   │   └── capture-with-color-review.json # Capture through Pink/Red/Gold
│   ├── n8n/
│   │   ├── ingest-opportunity.json        # n8n → V3 payload shapes
│   │   ├── ingest-fpds.json
│   │   ├── ingest-sam.json
│   │   ├── call-opp-tracker.json          # V3 → n8n payload shapes
│   │   └── ...
│   └── snapshots/
│       └── (Vitest snapshot files for complex response assertions)
```

### 11.2 Fixture principles

1. **Realistic synthetic data, not random garbage.** Fixture opportunities use real NAICS codes (541330, 541511), real agency names (Army Sustainment Command, USCG), realistic dollar values, and plausible solicitation numbers.
2. **Every fixture includes complete source attribution** (R1 compliance). No fixture should pass validation without `source_kind` and `source_url`.
3. **Snapshot-based assertions** for complex responses. Vitest inline snapshots for API response shapes that are cumbersome to assert field-by-field.
4. **No Riverstone/PD Systems-owned fixtures.** All fixtures are Envision-owned. Partner data appears only as `teaming_partners` array entries on Envision opportunities referencing partner lookup IDs.

---

## 12. Observability in tests

### 12.1 Coverage dashboard

Every CI run uploads metrics to a single tracking dashboard:

| Metric | Source | Tracked over time |
|---|---|---|
| **Unit test pass rate** | Vitest `--reporter=json` | Yes — trend per PR |
| **Integration test pass rate** | Vitest `--reporter=json` | Yes |
| **Source coverage %** | R1 gate report card (§6.3) | Yes — regression alerts if < 95% |
| **Contract conformance %** | Contract test results (§5) | Yes — must be 100% |
| **Schema drift count** | Drift detector output (§4) | Yes — must be 0 |
| **Analysis SLA compliance** | R2 gate timing results (§7.2) | Yes — regression alerts if SLA violated |
| **Bundle size (gzipped)** | Frontend build output | Yes — regression alerts if budget exceeded |
| **Migration replay success** | Prod-shape replay result (§3) | Yes — must be 100% |

### 12.2 Regression alerts

If any tracked metric drops below its threshold (source coverage < 95%, contract conformance < 100%, drift count > 0, SLA violation), the CI pipeline:

1. Fails the PR (if during PR gate).
2. Posts a comment on the PR with the specific regression and the last-known-good value.
3. For post-merge regressions (staging), sends a notification to Shawn via the existing notification system.

---

## 13. Open questions for Phase 1 review

| # | Question | Impact on test strategy | Default assumption |
|---|---|---|---|
| Q1 | Will V3 use a single migration runner (e.g., `node-pg-migrate`, `graphile-migrate`, custom)? | Determines tracker assertion logic in prod-shape replay | Single custom runner writing to `schema_migrations` only |
| Q2 | Where does the sanitized prod snapshot S3 bucket live? Same AWS account as CI or separate? | IAM policy design for snapshot access | Same account, restricted IAM role |
| Q3 | Will n8n workflows be migrated to use V3 canonical tables, or will shadow tables persist? | Scope of n8n contract tests and drift detection | Shadow tables are eliminated in V3; n8n uses canonical tables |
| Q4 | What is the analysis SLA for R2 on cold cache? 10 s is the proposal — is that acceptable? | R2 gate timeout | 10 s cold, 500 ms warm |
| Q5 | Should E2E tests run on every PR or only nightly? | CI time budget | Nightly + on cutover (not per-PR) |
| Q6 | Is Pinecone fully deprecated or does V3 need to test both vector backends? | Vector-related integration tests | Pinecone deprecated; pgvector only |
| Q7 | Does the `gda_runtime` least-privilege role (migration 123) carry forward to V3? | Integration test DB user configuration | Yes — tests run as `gda_runtime`, migrations run as `gda` superuser |
| Q8 | Frontend bundle size budget — 500 KB gzipped is the proposal. Acceptable? | Pre-deploy check threshold | 500 KB gzipped |

---

## Out of scope

These are addressed by sibling Phase 1 tickets:

| Topic | Ticket |
|---|---|
| Schema design | F-201 |
| API contract / OpenAPI spec | F-202 |
| Data migration strategy | F-203 |
