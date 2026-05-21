# GDA Command v2 — Stabilization Roadmap

**Date:** 2026-05-21 (updated 2026-05-19)
**Author:** Devin (reviewed by Shawn Seffernick)
**Status:** APPROVED — decisions locked 2026-05-19
**Scope:** Reconcile all F-XXX work (F-001 through F-024), surface skipped items,
map current state vs. destination, identify new work, and propose execution ordering.

**Source documents read:**
- `docs/stabilization/FAILURE-INVENTORY.md` (285 lines — 24 F-XXX entries)
- `docs/GDA-COMMAND-MASTER-DOC.md` (438 lines — acting as rebuild charter/PRD/stability standard)
- `docs/audits/workflow-inventory-2026-05.md` (298 lines — F-021 inventory)
- `docs/audits/workflow-triage-f022.md` (196 lines — F-022 triage)
- `docs/audit/FINDINGS.md` (385 lines — Phase 4 audit, 24 findings)
- `docs/audit/INVENTORY.md` (358 lines — Phase 1 codebase inventory)
- Issues #249 (F-019), #251 (F-020), #253 (F-021), #257 (F-022), #258 (F-023), #260 (F-024)
- Migration 017 source text (the contradictory data-source-priority statements)
- Backend route inventory from F-023 analysis (158 lines — 57 routes mapped)
- `docs/roadmap/findings-to-fxxx-mapping.md` (reconciliation of FINDINGS.md against F-XXX)

**Documents that did not exist at roadmap draft time (now resolved):**
- `docs/rebuild/` — created by F-025a (PR #264). Now contains: rebuild charter, PRD, product
  roadmap, and stability standard PDFs.
- The Master Doc (§2 Core Rules, §6 Pages Built, §10 TODO, §14 Design Decisions) remains the
  primary in-repo destination definition. PDFs are the **governing** documents per project rules.

---

## Section 1: Where We Are

### F-XXX Status Table (as of 2026-05-21)

| F-XXX | Title | Original Scope | Status Today | Notes |
|---|---|---|---|---|
| F-001 | Migration 044 UUID crash → restart loop | Fix UUID cast in seed migration | **Fixed** (PR #216) | Root fix. PR #213 added entrypoint resilience as defense-in-depth. |
| F-002 | No unhandledRejection handler | Add crash handlers | **Fixed** (PR #213) | Process no longer dies silently on async errors. |
| F-003 | Migration 028 FK delete ordering | Fix FK constraint violation | **Fixed** (PR #211) | DELETE order corrected. |
| F-004 | SAM sync empty timestamp errors | Fix mapper, backfill lost records | **Fixed** (PRs #218, #220, #222, #223) | Full chain: mapper fix → backfill → automated verify → QA Center integration. |
| F-005 | GovTribe/DIBBS API failures | Restore data feeds | **Fixed** (PRs #228, #230, #231, #237) | DIBBS deprecated (fake records). GovTribe rebuilt via MCP. Zapier dependency eliminated. |
| F-006 | GovWin API returns HTML | Fix OAuth2 integration | **Fixed** (PR #240, #241) | WSAPI OAuth2 integration built. |
| F-007 | Sidebar search crash | Fix undefined `.type` | **Fixed** (PR #206) | |
| F-008 | LLM calls hang forever | Add timeouts | **Fixed** (PR #194) | 60s timeouts on all AI chat calls. |
| F-009 | Versioning triggers fire 3× | Fix duplicate triggers | **Fixed** (PR #208) | Triggers deduplicated. But `record_version` still has 0 rows (see STALE-001 in FINDINGS.md). |
| F-010 | Duplicate migration numbers | Renumber + CI gate | **Fixed** (PR #224) | CI enforces unique prefixes. |
| F-011 | Missing migration 024 | Reconstruct + CI check | **Fixed** (PR #227) | File restored. CI checks completeness. |
| F-012 | 42 catch blocks swallow errors | Add error logging | **Fixed** (PR #208) | Silent failures now visible. |
| F-013 | Background tasks start before DB ready | Add waitForDB | **Fixed** (PR #213) | |
| F-014 | No cross-file type-safety in migrations | — | **Skipped-without-justification** | Listed as "Open (tracked separately)" since day one. Never scoped, never executed, never explicitly deprioritized. No issue opened. No PR attempted. |
| F-015 | Ingest mappers lack input sanitization | — | **Skipped-without-justification** | Same as F-014. "Open (tracked separately)" with no separate tracking visible. The SAM mapper was fixed as part of F-004 (PR #218), but GovTribe, GovWin, and FPDS mappers were not audited. |
| F-016 | Schema-mapper drift — silent field drops | — | **Skipped-without-justification** | Same pattern. "Open (tracked separately)" but no issue, no PR, no scope doc. The problem it describes (mappers write fields the DB silently drops) is real and undetected — no validation exists between mapper output shape and table schema. |
| F-017 | Migration tests don't cover production state | Build test harness | **Fixed** (PR #243, #246) | Harness built. 3 paired tests. Allowlist tightened. |
| F-018 | Unmarked state-dependent migrations | Full audit + paired tests | **Fixed** (PR #247, #248) | 55 migrations audited. 9 paired tests covering all high-risk state-dependent migrations. |
| F-019 | Production state modified outside deploy path | Deploy guard | **Partially Fixed** (PR #250, #252) | Manifest verification, provenance recording, drift check shipped. Role separation deferred to F-020. **F-023 finding widens the wound:** F-019's controls scope to `gda_command` only. The 76 shadow tables in `n8n-envision-postgres-1` are completely invisible to manifest verification, provenance, and drift check. F-019 is technically correct for its scope but the scope is too narrow given F-023. |
| F-020 | Demote `gda` from SUPERUSER | One-time infrastructure procedure | **Confirmed unblocked** | Originally blocked by F-023 (DDL in workflows would break after demotion). **Confirmed 2026-05-19:** All 323 Postgres nodes (304 active, 19 inactive) use exactly one credential ("GDA Postgres") pointing at `n8n-envision-postgres-1`. Zero workflows connect to `gda-v2-postgres`. Zero DDL operations target `gda_command`. Docker networks are physically isolated (n8n on `n8n-envision_envision-internal`, gda-v2-postgres on `gda-command-v2_gda-internal` — zero overlap). The F-020 → F-023 dependency is **invalidated**. See #251 for raw query results. |
| F-021 | 96% of scheduled workflows not firing | Workflow inventory audit | **Fixed** (PR #256) | Inventory document produced. Root cause hypothesis (queue/activation failure) confirmed by F-024. |
| F-022 | 168 silent workflows need triage | Classify all workflows | **In Progress** | 47 cron workflows classified (24 keep-and-fix, 20 investigate, 2 archive, 1 frozen). 124 webhook workflows still pending (Subtask A). **F-023 finding invalidates some consumer claims:** 7 keep-and-fix workflows had "backend SQL reads" claimed as consumers, but those reads hit empty tables in `gda_command`. The actual working consumer is the n8n webhook chain, not direct SQL. Classifications still hold but justifications need correction. |
| F-023 | Shadow schema DDL — 39 tables outside migration system | Inventory + backfill + workflow cleanup | **Open — reframed** | Original scope (backfill 39 shadow tables into gda_command migrations) was based on a false assumption: that the tables were in `gda_command`. They're in `n8n-envision-postgres-1`. The problem is now understood as: (a) "GDA Postgres" credential misconfiguration since day one, (b) split-brain database with zero data path between workflow output and backend SQL queries, (c) table naming mismatch (workflows use `gda_` prefix, backend uses unprefixed names). Architecture decision pending — consolidate vs. formalize webhook layer vs. hybrid. Prerequisite: backend route inventory (delivered), F-020 dependency analysis (delivered — F-020 is NOT blocked by F-023). |
| F-024 | n8n cron scheduler not firing | Fix scheduler | **Fixed** (PR #262) | Root cause: n8n 2.14.2 scheduler bug. Upgraded to 2.21.5. 34/47 cron workflows confirmed firing within 24h. Zero Code node timeouts post-upgrade (F-021 §4 resolved as side effect). Per-workflow `saveDataSuccessExecution` flipped to enable verification. intel-feed has persistent daily errors at 08:00 UTC (separate bug, not scheduler). |

### Items That May Need to Reopen

| F-XXX | Why it may reopen |
|---|---|
| F-009 | Triggers fixed, but `record_version` has 0 rows. Versioning system has never captured a version. Related to STALE-001 (FINDINGS.md). Not a regression — the underlying issue (n8n mutations bypass DB triggers, no retroactive snapshots) was never in scope. |
| F-019 | Controls scope to `gda_command` only. The 76 shadow tables in `n8n-envision-postgres-1` are invisible to F-019's manifest, provenance, and drift check. Depending on the F-023 architecture decision, F-019's scope may need expansion. |
| F-021 | Closed as "inventory audit produced." But the recurring weekly inventory GitHub Action proposed in §6 was never built. If workflow observability is part of the definition of done, this deliverable is still open. |
| F-022 | Consumer claims for 7 keep-and-fix workflows were based on "backend SQL reads" that actually hit empty tables. Classifications are still correct (webhook path works) but the triage document needs a correction annotation. |

### Skipped-Without-Justification: F-014, F-015, F-016

These three entries have been in the FAILURE-INVENTORY.md since it was created, each marked
"Open (tracked separately)." No issue was ever opened for any of them. No PR was attempted.
No scoping comment exists. They were not explicitly deprioritized — they were simply never
picked up while F-017 through F-024 consumed all available execution bandwidth.

**F-014 (cross-file type-safety in migrations):** The migration system has paired tests (F-017/F-018)
that catch state-dependent failures, but no validation that migration SQL is type-safe across
files. If migration 050 references a column type created by migration 049, and 049 is altered,
050 silently breaks. This is a real gap — migration 044's UUID crash (F-001) is exactly this failure
mode.

**F-015 (ingest mapper sanitization):** SAM mapper was fixed (F-004), but GovTribe, GovWin, and
FPDS mappers were not audited for the same class of problem (empty strings, nulls, type mismatches
on ingest). The GovTribe mapper was rebuilt from scratch (F-005/PR #237), which may have addressed
this implicitly. GovWin was rebuilt (F-006/PR #240). FPDS was not touched.

**F-016 (schema-mapper drift):** No detection exists for the case where a mapper writes a field
that the database silently drops (column doesn't exist, wrong type that gets cast). This is
structural — the mapper output shape and the table schema are never compared. F-023's table
naming mismatch (workflows use `gda_intelligence_log`, backend uses `intel_items`) is the same
class of problem at a higher level.

---

## Section 2: Where We're Going — Definition of Done

### Primary Source: GDA-COMMAND-MASTER-DOC.md

The Master Doc is the only destination definition in the repository. The rebuild charter, PRD,
product roadmap, and stability standard exist as PDFs in Shawn's project context but are NOT
committed to the repo. This means:

- Future contributors only see the Master Doc
- Drift between the Master Doc and the PDFs is invisible
- The destination definition lives outside the codebase

**This is itself a stabilization problem.** See proposed F-025a/F-025b (Section 4).

### Destination Criteria (Quoted from Master Doc)

**Core Rules (§2 — Non-Negotiable):**

> 1. "Nothing is in Pipeline until Shawn approves it." Enforced in data model, API, and UI.
> 2. "All opportunities live in Ops Tracker." That is the full universe. Pipeline is a filtered, approved subset.
> 3. "No secrets in the browser." React only calls /api/... routes. Never call n8n directly from frontend.
> 4. "Standard JSON envelope on every endpoint:" `{ "success": true, "action": "...", "dryRun": false, "data": {}, "meta": {}, "error": null }`
> 5. "No charts until data logic is proven correct."
> 6. "Human-in-the-loop for all risky actions" — sends, deploys, writes, paid AI calls.
> 7. "PostgreSQL is truth." GitHub holds docs. n8n runs automation. React shows results.
> 8. "A feature isn't done until it survives deploy, passes tests, and fails visibly when something breaks."
> 9. "The platform removes you from operations while keeping you in control of decisions."
> 10. "If the same data appears in multiple places, it must be identical everywhere." One source of truth.

**Features Done (§6 — 36 pages built):**

The Master Doc lists 36 pages as "built." The Phase 4 audit (STALE-002) found 41 empty tables
behind those pages. F-023 revealed that many of those tables have data — it's in the wrong
database. The pages are built; the data paths are broken.

**Features Still TODO (§10 — 15 items):**

15 items ranging from HIGH (auto-run Capture Coach, consolidate Proposal Center, Company Intel DB,
Shipley stage dropdown, per-opp AI chat) to LOW (scalable storage, admin consolidation, report
style guide, per-opp Pwin).

**Features ON HOLD (§10 — 5 items):**

Financial Bible (waiting on Shawn's data), contract waterfall, real opportunity data, AI Agent
Architecture discussion, import from v1.

**Completion Standard (§2, Rule 8):**

> "A feature isn't done until it survives deploy, passes tests, and fails visibly when something breaks."

This is the closest thing to a "stability standard" in the repo. It implies:
1. Every feature must survive deploy (migration system must be sound)
2. Every feature must pass tests (tests must exist)
3. Every feature must fail visibly (observability must exist)

### Contradiction: Migration 017 vs. Core Rule 7 — RESOLVED

**Core Rule 7:** "PostgreSQL is truth."

**Migration 017 (Book of Truths), seeded into `bot_sources`:**
> "n8n live feeds are the primary data source. Local database is the fallback."
> "n8n webhook = primary source of truth for opportunities"
> "Local DB = fallback and user-generated data"

**Decision (F-025b — locked 2026-05-19):** PostgreSQL is truth. The rebuild charter and PRD
(governing PDFs) win over Migration 017's seeded language. Migration 017's `bot_sources` data
gets corrected as part of the consolidation work. Reasoning: treating seeded implementation data
as canonical is what produced four months of drift; the architectural intent in the governing
PDFs defines the destination.

**Decision (F-026 — locked 2026-05-19):** Consolidate. All application data into `gda_command`.
One Postgres. Workflows write there, backend reads there. The 76 shadow tables in
`n8n-envision-postgres-1` migrate into `gda_command` under the migration system. 323 workflow
Postgres nodes repoint to the "GDA Postgres" credential (which itself repoints to `gda-postgres`
as `gda_app`). No hybrid. No sync layer. Reasoning: hybrid guarantees another split-brain-class
problem; sync adds a new place for silent failure; consolidation has bounded one-time cost and
zero ongoing maintenance burden.

The current system operates as if migration 017 is true: DUAL-path routes try n8n webhook first,
fall back to DB. But the "GDA Postgres" credential misconfiguration means the DB fallback hits
empty tables. **Neither document's vision was implemented correctly. Both are now superseded
by the locked decisions above.**

### Supplementary: PDF Documents (Not in Repo)

Per Shawn's direction: the rebuild charter, PRD, product roadmap, and stability standard exist
as PDFs outside the repo. Where the Master Doc and PDFs disagree, this roadmap notes the
contradiction but does not resolve it — that resolution is part of F-025b.

Known disagreements surfaced so far:
- Master Doc §2 Rule 7 says "PostgreSQL is truth"
- Migration 017 (in-repo, seeded data) says "n8n webhook = primary source of truth"
- The PDFs may contain additional destination criteria not reflected in the Master Doc

---

## Section 3: The Gaps

For each destination criterion from Section 2, the gap between today and the target.

### 3.1 — "PostgreSQL is truth" (Core Rule 7)

**Today:** PostgreSQL is NOT truth for workflow-produced data. 76 shadow tables with real
production data exist in `n8n-envision-postgres-1`. The `gda_command` database has empty copies
of many of these tables. 4 backend routes are definitively broken (risk-register: 0 vs 451 rows,
morning-commander: 0 vs 39, contacts: 0 vs 2, compliance: 0 vs 8). 6 DUAL-path routes partially
work via webhook but their DB fallback returns empty/stale data.

**Gap:** Foundational. Cannot be closed without the system-of-record architecture decision (F-023).

**F-XXX:** F-023 (open), plus proposed F-025b → F-026 (reconciliation then system-of-record decision).

### 3.2 — "Standard JSON envelope on every endpoint" (Core Rule 4)

**Today:** Unknown. No systematic audit of whether all endpoints return the standard envelope.
The backend route inventory (F-023 analysis) mapped 57 route files but did not check response
format compliance.

**Gap:** Needs inventory. The Phase 4 audit did not check this either.

**F-XXX:** Proposed F-028 (backend route contract enforcement).

### 3.3 — "A feature isn't done until it survives deploy, passes tests, and fails visibly" (Rule 8)

**Today:**
- **Survives deploy:** Migration system is now sound (F-010, F-011, F-017, F-018, F-019). But
  shadow schema (76 tables) is completely outside the migration system.
- **Passes tests:** CI runs tests on PR. But no E2E integration tests exist. No smoke test
  verifies that deployed features actually work with live data.
- **Fails visibly:** 42 catch blocks were fixed (F-012). But n8n workflow failures have no
  alerting (OBSERVE-002). Health check doesn't cover n8n (OBSERVE-003). Per-workflow
  `saveDataSuccessExecution` was `none` for most workflows until F-024 cleanup.

**Gap:** Deploy survival is strong for `gda_command`. Test coverage is unit-only — no integration
or E2E. Visible failure is partially addressed but n8n observability is still weak.

**F-XXX:** F-019 (partial), proposed F-027 (E2E test discipline), proposed F-028 (contract enforcement).

### 3.4 — "If the same data appears in multiple places, it must be identical" (Rule 10)

**Today:** Violated everywhere that workflow data meets backend SQL. `risk_register` has 0 rows
in `gda_command` and 451 in `n8n`. `opportunities` has 10 in `gda_command` and 1,757 in `n8n`
(as `gda_opportunity_tracker`). Table names don't even match between systems.

**Gap:** Total. The data is not just non-identical — there's no synchronization mechanism at all.

**F-XXX:** F-023 (open), proposed F-025b → F-026 (reconciliation then system-of-record decision).

### 3.5 — Persistent KPI Strip (Design Decision §14.1)

**Today:** The KPI strip concept exists (Orders, Sales, EBIT, Gross Profit, ROS, Funded Backlog,
Contract Backlog). Financial Bible is ON HOLD waiting on Shawn's data. The strip renders but
with placeholder/zero values on most pages.

**Gap:** Data source not connected. Blocked on Financial Bible data from Shawn.

**F-XXX:** No F-XXX. This is product work blocked on external input.

### 3.6 — Launchpad Top 10 Scoring Opportunities

**Today:** Launchpad page exists. Scoring logic exists (AI-assisted via agents). But the
opportunity data feeding it comes from 10 seed records in `gda_command` while 1,757 real records
sit in the n8n database. The scoring is running against the wrong data.

**Gap:** Blocked by F-023/F-026 (system-of-record decision). Once data path is fixed, scoring
can operate on real data.

**F-XXX:** F-023 (open), F-026 (system-of-record decision), then product work after data path is resolved.

### 3.7 — Ops Tracker / Pipeline Separation

**Today:** Ops Tracker and Pipeline are separate pages with separate routes. The data model
enforces that Pipeline requires `approved_at IS NOT NULL`. This separation exists in code.

**Gap:** The Ops Tracker shows 10 opportunities (from `gda_command` seed data). The real universe
of 1,757 opportunities is in the n8n database. The separation is structurally correct but
operating on incomplete data.

**F-XXX:** Same data path issue — F-023/F-026.

### 3.8 — Financial Bible Drill-Downs

**Today:** Financial Bible page exists at `/financials`. Has 16 `financial_kpis` and 3
`monthly_financials` rows. ON HOLD waiting for Shawn's financial data.

**Gap:** Blocked on external input, not on engineering.

**F-XXX:** No F-XXX. ON HOLD item, not a failure.

### 3.9 — Prompt Architect, Compliance Matrix, Proposal Review

**Today:**
- **Prompt Architect** (`/prompts`): Page exists. `prompts` table has 0 rows in `gda_command`.
  `gda_prompt_library` has 0 rows in n8n DB. Both empty — feature is placeholder.
- **Compliance Matrix** (`/compliance`): Page exists. `compliance_requirements` has 0 rows in
  `gda_command`. `gda_compliance_matrices` has 8 rows in n8n DB. Data exists but in wrong DB.
- **Proposal Review** (`/proposals`): Page exists. `proposals` has 6 rows. Partial data.

**Gap:** Compliance is a data-path issue (F-023). Prompt Architect and Proposal Review need
content population — not structural fixes, but product work.

**F-XXX:** Compliance → F-023/F-026. Others → product work.

### 3.10 — Smoke / API Contract / Business-Journey E2E Tests

**Today:**
- **Smoke tests:** CI runs migration smoke test (fresh DB). No deployed-state smoke test.
- **API contract tests:** None exist. Standard JSON envelope compliance is unchecked.
- **Business-journey E2E:** None exist. No test verifies "opportunity flows from SAM.gov
  through n8n workflow through backend route to frontend page."

**Gap:** Total for E2E. Partial for smoke (migration-only). Zero for API contract.

**F-XXX:** Proposed F-027 (E2E test discipline), proposed F-028 (contract enforcement).

---

## Section 4: New F-XXX Work

Continuing the sequence from F-024.

### F-025a: Commit Rebuild PDFs to Repo

**Title:** Commit charter/PRD/stability standard/roadmap PDFs into `docs/rebuild/`.

**Description:** The destination definition for the rebuild lives outside the codebase (PDFs in
Shawn's project context). Future contributors only see the Master Doc, and drift between the
Master Doc and the PDFs is invisible. This task commits the PDFs to `docs/rebuild/` so the
governing documents are versioned alongside the code.

**Priority:** P1 — 15-minute task. The PDFs are the governing documents per project rules.

**Dependency:** None. Can start immediately. Blocks nothing.

### F-025b: Reconcile Contradictions That Affect F-026 — DECISION LOCKED

**Title:** Surface where GDA-COMMAND-MASTER-DOC.md disagrees with the governing PDFs; Shawn
rules on each.

**Decision (locked 2026-05-19):** PostgreSQL is truth. The rebuild charter and PRD (governing
PDFs) win over Migration 017's seeded "n8n webhook = primary" language. Migration 017's
`bot_sources` data gets corrected. Remaining work: document the full reconciliation of all
Master Doc vs. PDF disagreements (not just the system-of-record question).

**Priority:** P0 — decision is locked; documentation deliverable remains.

**Dependency:** F-025a (completed — PDFs in repo). Unblocks F-026 (decision locked).

### F-026: System-of-Record Architecture Decision + Consolidation — DECISION LOCKED

**Title:** Consolidate all application data into `gda_command`. One Postgres.

**Decision (locked 2026-05-19):** Consolidate. All data into `gda_command` on `gda-postgres`.
Workflows write there, backend reads there. No hybrid. No sync layer.

**Scope — what IS in F-026:**
- Move 62 net-new tables from `n8n-envision-postgres-1` to `gda_command`, **dropping the `gda_` prefix**
  (scripted `sed` on exported JSON for the 323 workflow node updates, not manual)
- Create proper migrations for all moved tables under the migration system
- Repoint all 323 workflow Postgres nodes to new "GDA Postgres" credential → `gda-postgres` as `gda_app`
- Network bridge so n8n can reach `gda-postgres`
- Smoke test on non-critical workflows before full cutover

**Scope — what is NOT in F-026:**
- The 12 same-concept-different-schema overlapping tables (e.g., `opportunities` vs.
  `gda_opportunity_tracker`). Each gets a separate Tier 3 work item with per-table decisions
  on which is authoritative, merge strategy, and migration plan.
- Frontend "Live API" / "Live DB" relabeling — parallel cleanup, not blocking.
- Migration 017 `bot_sources` correction — parallel cleanup.

**Hard acceptance criteria:**
- All 323 workflow nodes use `gda_app` (NOSUPERUSER) credential, not bootstrap `gda` superuser
- Docker network bridge verified with read-only test workflow before any data migration
- Dry-run on snapshot/copy before production migration of 62 tables

**Implementation sequencing (Shawn-approved 2026-05-19):**

| Step | Work | Tier | Prereqs |
|---|---|---|---|
| Step 1 — Pre-flight | Kill orphan containers, restrict `N8N_CORS_ALLOWED_ORIGINS`, enable pgvector, document `gda_app` credential | Tier 0 | None |
| Step 2 — Network bridge | Add `gda-postgres` to shared external Docker network reachable by n8n. Verify with one read-only test workflow. | Tier 1→3 | Step 1 |
| Step 3 — Schema migration | Migrate 62 net-new tables into `gda_command` with `gda_` prefix dropped. Proper migrations. Dry-run first. | Tier 3 | Step 2 |
| Step 4 — Workflow repoint | Scripted JSON edit of 323 Postgres nodes. New credential → `gda-postgres` as `gda_app`. Smoke test non-critical first, then full cutover. | Tier 3 | Step 3 |
| Step 5 — Overlap reconciliation | 12 per-table work items (separate from F-026). Which is authoritative, merge strategy, migration plan. | Tier 3 backlog | Step 4 |

**Parallel (any time after Step 3):**
- Migration 017 `bot_sources` seed correction
- `book-of-truths.ts` route fix
- Frontend "Live API" / "Live DB" relabel across ~8 pages
- Backend `source: "n8n" | "db"` response field cleanup

**Priority:** P0 — every data-path fix depends on this.

**Dependency:** F-025b (locked). Prereqs: Tier 0 pre-flight items complete.

### F-027: End-to-End Integration Test Discipline

**Title:** Establish E2E integration test suite covering data path from source through workflow
through backend to frontend.

**Description:** The split-brain database problem existed for months without detection because
no test verifies the full data path. This task: (a) defines the E2E test methodology (what
constitutes a "business journey" test), (b) implements the first 3-5 journey tests covering
the highest-value paths (SAM.gov → opportunity → Ops Tracker, intel-feed → intelligence_log →
Intel Hub, capture workflow → capture_plans → Capture Planner), (c) integrates into CI or
a scheduled run. The test discipline should have caught the database split at build time.

**Priority:** P1 — preventive. The class of problem F-023 found (silently broken integration
across system boundaries) will recur without this.

**Dependency:** F-026 (system-of-record decision — tests need to know which database to assert
against).

### F-028: Backend Route Contract Enforcement

**Title:** Audit and enforce standard JSON envelope contract on all 57 backend routes.

**Description:** Core Rule 4 requires `{ success, action, dryRun, data, meta, error }` on every
endpoint. No audit has checked compliance. The Phase 4 FINDINGS.md did not cover this. This task:
(a) inventories every route's response format, (b) documents deviations, (c) proposes whether
to enforce via middleware or per-route, (d) implements enforcement. Also covers the 14 unaddressed
FINDINGS.md items that naturally roll into route-level work: BROKEN-002/PERF-001 (SAM pagination),
OBSERVE-003 (health check n8n coverage). (RISK-001/CORS is now F-032a; RISK-003/RISK-004 are
now F-032b.)

**Priority:** P2 — structural quality. Not blocking other work but accumulating technical debt.

**Dependency:** None for the audit. Implementation may depend on F-026 (routes serving workflow
data need to know which database to query).

### F-029: Credential and Configuration Audit

**Title:** Audit all credentials, environment variables, and configuration for correctness.

**Description:** The "GDA Postgres" credential was misconfigured — pointing at the wrong database
since day one. If the most critical credential was wrong, what else is? This task: (a) inventories
every credential in n8n (API keys, database connections, webhook secrets), (b) inventories every
environment variable in the backend `.env` and Docker Compose files, (c) cross-references against
documentation (STALE-004: 11 env vars undocumented), (d) validates that each credential actually
connects to what it claims to connect to. Also covers OBSERVE-002 (n8n alerting configuration)
and OBSERVE-003 (health check coverage).

**Priority:** P1 — trust. If we can't trust the credentials, we can't trust the system.

**Dependency:** None. Can start immediately.

### F-030: Frozen Workflow Review

**Title:** Review all frozen workflows and validate the freeze designation.

**Description:** Three workflows are frozen (GDA.cron.fast-track-ingest, plus two others flagged
in F-022). The frozen designation is load-bearing — it prevents modification — but nobody has
checked whether the freeze is still appropriate. F-024's n8n upgrade resolved the Code node 300s
timeout (F-021 §4), which was the original reason fast-track-ingest was frozen. This task: (a)
lists all frozen workflows with their freeze reason, (b) checks whether the freeze reason still
holds post-F-024, (c) recommends unfreeze, continued freeze, or archive for each.

**Priority:** P2 — hygiene. Frozen workflows are deferred risk.

**Dependency:** F-024 (completed — scheduler fix landed, timeout resolved).

### F-031: Workflow Consolidation

**Title:** Triage and consolidate the 185-workflow long tail beyond F-022's first 47.

**Description:** F-022 triaged 47 cron workflows. 124 webhook-triggered workflows and 11 inactive
workflows remain unclassified (Subtask A of F-022). The total inventory is 185 workflows, most
silent. This task: (a) completes webhook dependency mapping (Subtask A), (b) identifies duplicate
/ overlapping workflows (e.g., two `gist-update` workflows, multiple intel-feed variants), (c)
proposes consolidation targets (merge duplicates, archive dead code), (d) executes archival of
confirmed dead workflows (after approval).

**Priority:** P2 — long tail. Individual workflows are low-risk but the aggregate is maintenance
burden and confusion.

**Dependency:** F-026 (system-of-record decision — some webhook workflows may need to change
behavior depending on the architecture choice).

### F-032a: CORS Fix

**Title:** Restrict CORS to `gda.csr-llc.tech`.

**Description:** RISK-001 (Phase 4 audit, P0): CORS allows all origins. 30-minute fix —
restrict `Access-Control-Allow-Origin` to `gda.csr-llc.tech` (and localhost for dev).

**Priority:** P0 — actively exploitable misconfiguration.

**Dependency:** None. Tier 0.

### F-032b: Security Hardening — xlsx, Webhook Registry, Health Endpoints

**Title:** Address remaining FINDINGS.md security items — xlsx vuln, webhook registry auth,
health endpoint exposure.

**Description:** Three security findings from the Phase 4 audit beyond CORS:
RISK-002 (xlsx prototype pollution, P1), RISK-003 (webhook registry publicly accessible, P2),
RISK-004 (health endpoints expose internals, P3). This task: (a) replace `xlsx` with `exceljs`
or remove if unused, (b) put webhook registry behind auth, (c) strip internal details from
public health endpoint.

**Priority:** P2 — none are P0-urgent individually.

**Dependency:** None. Can start anytime. Tier 3.

### F-033: AI Knowledge Corpus Foundation

**Title:** Build the AI knowledge corpus that every rebuild-charter AI tool depends on.

**Description:** GDA's value proposition is AI analysis tools (Compliance Matrix, Proposal Review,
Prompt Architect, AI Agent Chat) on top of a federal acquisition knowledge corpus. The Phase 4
audit (STALE-003) found 1 of 23 documents embedded. Every AI tool the rebuild charter and PRD
call for depends on a functioning corpus. Building the corpus foundation as part of stabilization
— alongside data-path fixes — means the AI tools have something to consume the moment they're
built. Deferring to Tier 4 means stabilizing a platform with no analytical depth.

**Two phases:**

**F-033 Step 0 (Tier 2):** Embedding pipeline inventory — read-only scoping. Covers:
1. Pipeline architecture — where embedding happens, what triggers it, what model, where vectors
   land. File paths, workflow IDs, table names, config.
2. Vector storage — pgvector in `gda_command`, separate Postgres, or external service
   (Pinecone/Weaviate/Qdrant)? If pgvector, which table, dimensions, index type.
3. Retrieval interface — API route doing similarity search? Query shape? Frontend calling it?
4. Current corpus contents — which 1 of 23 documents is embedded? What are the other 22,
   where do they live?
5. Why is it 1/23? Pipeline abandoned mid-build? Gated? Failing silently?
6. F-026 dependency — does vector storage location depend on the system-of-record decision,
   or does it sidestep it?
7. Recommendation: extend existing pipeline or build fresh? Justify with specifics.

**F-033 Phase 2 (Tier 3):** Corpus implementation + WIFCON as first source. Scope written after
Step 0 findings land and Shawn approves direction. Expected: ingest workflow for WIFCON (homepage
policy aggregator + Vern Edwards blog + forum), embedding pipeline, vector store, retrieval API
endpoint returning standard JSON envelope, documentation of the pattern so adding source #2
(FAR text), #3 (GAO decisions), etc., is mechanical.

**Priority:** P1 — strategic. The corpus is the moat. Every AI tool depends on it.

**Dependency:** Step 0 has no blockers (read-only inventory). Phase 2 depends on Step 0 findings,
Shawn's approval of direction, and F-034 (embedding service is Deliverable 2 of F-034).

### F-034: AI Infrastructure Foundation

**Title:** Establish the AI infrastructure layer (LiteLLM gateway, embedding service, Langfuse
observability) that every subsequent agentic / LLM feature in GDA Command depends on.

**Status:** Queued — DO NOT START until F-026 cutover is complete and verified.

**Description:** Three self-hosted Docker services on the existing VPS. No external SaaS
dependencies for prompt/response data. This is the foundation for F-033 (AI Knowledge Corpus),
Capture Intelligence module (BOE + Past Performance extraction), and all future agentic loops,
opportunity classifiers, semantic dedupe, and watchlist matching.

**Hard prerequisites (ALL must be true before F-034 begins):**
1. F-026 consolidation complete — one Postgres (`gda-postgres`), all workflow nodes repointed
   to `gda_app` credential, orphan containers removed.
2. F-029 credential remediation complete — no stray Pinecone env vars, no key drift between
   backend and n8n, CORS restricted.
3. `pgvector` extension verified enabled on `gda-postgres` (F-026 Step 1 pre-flight).
4. Tier 0 closed.

**Three deliverables (sequential, not parallel):**

**Deliverable 1 — LiteLLM gateway (self-hosted):**
- Docker service on shared internal network with `gda-postgres` and backend.
- Postgres-backed config/logging under `litellm` schema (NOT public schema).
- Master key + virtual API keys (separate keys for backend and n8n).
- All upstream model-provider API keys removed from backend env and n8n credentials —
  only LiteLLM holds upstream keys.
- Models configured: `gpt-4o`, `gpt-4o-mini`, `text-embedding-3-small`, `claude-sonnet-4`.
- Cost tracking enabled per virtual key.
- One n8n workflow + one backend route updated as proof-of-life.
- Documented in `docs/infra/litellm.md`.

**Deliverable 2 — Embedding service (backend-owned):**
- Backend service module: `POST /api/internal/embeddings/embed` + `POST /api/internal/embeddings/search`.
- One embedding model pinned: `text-embedding-3-small` (1536 dims). Model name + dimensions
  stored with every vector. Mixing models forbidden.
- All calls routed through LiteLLM (Deliverable 1).
- `gda_embeddings` schema: `(id, entity_type, entity_id, embedding vector(1536), model_name,
  model_version, content_hash, created_at, updated_at)`. Unique index on `(entity_type, entity_id)`.
  IVFFLAT or HNSW index on `embedding`. Content hash check — skip re-embedding if unchanged.
- Internal-only routes, not exposed publicly.
- One real entity type wired end-to-end as proof-of-life (`opportunity_title_description`).
- Documented in `docs/infra/embeddings.md`.

**Deliverable 3 — Langfuse (self-hosted):**
- Docker service on shared internal network.
- Backed by `gda-postgres` under `langfuse` schema (NOT public).
- LiteLLM configured to emit traces to Langfuse.
- Retention: full prompt/response payloads 90 days, aggregated stats indefinite.
- Admin auth configured. Not publicly exposed without auth.
- Documented in `docs/infra/langfuse.md`.

**Sequencing:** LiteLLM first (dependency for other two) → Embedding service → Langfuse.
Three PRs, sequential. Each self-contained with docs and rollback notes.

**Architectural requirements:**
1. One shared Docker network (continuation of F-026 Step 2 network bridge).
2. Schema isolation: each service gets its own Postgres schema (`litellm`, `langfuse`).
3. All upstream LLM API keys live in LiteLLM only — removed from backend `.env` and n8n.
4. Backup coverage: all new schemas included in daily Postgres dump.
5. No public exposure without auth.

**Acceptance for closure:** All three deliverables merged, proof-of-life callers running,
`docs/infra/` documentation for all three, cost attribution visible for 7+ days, Langfuse
showing traces, architect sign-off.

**Non-goals (explicit deferrals):** Migrating every LLM call site to LiteLLM, backfilling
embeddings, semantic dedupe (F-035 candidate), watchlist matching (F-036 candidate),
SAM.gov mod/award subscriptions (F-037 candidate), BullMQ/queue system, feature flags,
Vercel AI SDK, PDF parser selection, Promptfoo eval harness.

**Cost:** ~13–23 hours Devin time post-F-026. <$30/mo ongoing (embedding API through LiteLLM).
All infra on existing VPS at $0 incremental hosting.

**Priority:** P1 — foundational. Every AI feature depends on this infrastructure.

**Dependency:** F-026 complete + F-029 remediation closed + pgvector enabled + Tier 0 closed.
Architect approval required before implementation begins.

---

## Section 5: The Ordering

### Tier 0 — Stop the Bleeding

Items that must happen before any new work. Small, urgent, no architecture decisions required.

| F-XXX | Item | Status | Rationale |
|---|---|---|---|
| (cleanup) | `saveDataSuccessExecution` flip for remaining workflows | **Done** (F-024 follow-up) | Observability prerequisite. Already executed. |
| (cleanup) | `gda_idiq_tracker` CHECK constraint bug fix | **Done** | DEFAULT fixed from `monitoring` to `targeting` in DB and workflow SQL. Re-apply as migration if F-026 consolidates. |
| (cleanup) | intel-feed persistent daily error capture | **Open** | 3 consecutive 08:00 UTC errors with execution data pruned. `saveDataSuccessExecution` now set to `all` — next error (05/22 08:00 UTC) will be capturable. Diagnosis pending. |
| F-032a | CORS fix (backend) | **Done** | Backend CORS already correctly restricted to `gda.csr-llc.tech` in production. Verified — no code change needed. |
| (F-026 pre-flight) | n8n CORS restriction | **Open — P0 prerequisite to F-026** | `N8N_CORS_ALLOWED_ORIGINS=*` is wide open. Once n8n writes to `gda_command`, this is an unauthenticated write path into the app DB. Restrict to known origins BEFORE cutover. |
| (F-026 pre-flight) | Kill orphan containers | **Open** | `gda-v2-postgres`, `gda-v2-backend`, `gda-v2-frontend` are orphans from old deployment. Two Postgres containers during migration is how data ends up in the wrong place. Remove before consolidation work. |
| (F-026 pre-flight) | Enable pgvector on gda-postgres | **Open** | Prerequisite for `gda_embeddings` table migration and F-033 corpus work. `CREATE EXTENSION vector` on `gda-postgres`. |
| F-029 | Credential and configuration audit | **Done** (findings posted on #258) | Key: SAM/OpenAI keys differ between backend and n8n, 6 unused credentials, n8n CORS wide open, undocumented Firecrawl/Pinecone env vars. Awaiting Shawn review for remediation. |
| F-025a | Commit rebuild PDFs to repo | **Done** (PR #264) | PDFs committed to `docs/rebuild/`. |
| F-020 | Role demotion (`gda_app` NOSUPERUSER) | **Done** | `gda_app` created in `gda-postgres`. Backend running as `gda_app`. Health check returns `ok`. PG16 won't demote bootstrap user — separate application role used instead. |

### Tier 1 — Foundational Decisions — LOCKED

Both architecture decisions locked 2026-05-19. Documentation deliverables remain.

| F-XXX | Item | Status | Rationale |
|---|---|---|---|
| F-025b | Reconcile contradictions affecting F-026 | **DECISION LOCKED** — PostgreSQL is truth. Governing PDFs win over migration 017 seed data. | Documentation deliverable: reconcile all Master Doc vs. PDF disagreements (not just system-of-record). |
| F-026 | System-of-record: consolidate to `gda_command` | **DECISION LOCKED** — one Postgres, no hybrid, no sync layer. | Implementation sequencing defined (Steps 1-5). See Section 4 F-026 for full breakdown. |

### Tier 2 — Foundation Work / Inventories

Read-only or low-risk write work that surfaces what's broken without changing it.

| F-XXX | Item | Depends On | Rationale |
|---|---|---|---|
| F-028 | Backend route contract audit (inventory phase) | Nothing | Maps every route's response format, database reads, and frontend usage. The audit portion is read-only. |
| F-022 | Webhook dependency mapping (Subtask A) + consumer claim correction | Nothing | 124 webhook workflows still unclassified. Read-only triage. **Explicit deliverable:** correct the 7 keep-and-fix workflows whose consumer claims were invalidated by F-023 (claimed "backend SQL reads" that hit empty tables in `gda_command` — actual working consumer is n8n webhook chain). Produce corrected triage doc. |
| F-030 | Frozen workflow review | F-024 (done) | Check whether freeze reasons still hold post-upgrade. Read-only assessment. |
| F-014 | Cross-file type-safety in migrations (scope) | Nothing | Was skipped without justification. At minimum, scope it: what does "cross-file type-safety" mean concretely, what would a check look like, how many migrations are at risk? |
| F-016 | Schema-mapper drift detection (scope) | F-026 | Scoping depends on the architecture decision — if workflows consolidate into `gda_command`, the mapper-to-schema check looks different than if the split-brain is formalized. |
| F-033 Step 0 | AI knowledge corpus — embedding pipeline inventory | Nothing | Read-only scoping: pipeline architecture, vector storage, retrieval interface, current corpus contents (1/23 embedded per STALE-003), why only 1/23, F-026 dependency analysis, extend-vs-rebuild recommendation. Same posture as F-028/F-022/F-030 audit phases. |
| F-034 | AI Infrastructure Foundation (LiteLLM + embedding service + Langfuse) | F-026 complete, F-029 remediation closed, pgvector enabled, Tier 0 closed | Three self-hosted Docker services. Sequential: LiteLLM → embedding service → Langfuse. Foundation for F-033 Phase 2, Capture Intelligence, all future AI features. **DO NOT START until all prerequisites verified.** Architect approval required. |

### Tier 3 — Targeted Fixes

Address what inventories surface. Implementation work.

| F-XXX | Item | Depends On | Rationale |
|---|---|---|---|
| F-026 Steps 2–4 | Consolidation implementation (network bridge → schema migration → workflow repoint) | Tier 0 pre-flight complete | See F-026 Section 4 for 5-step breakdown. 62 net-new tables migrated with `gda_` prefix dropped. 323 workflow nodes repointed via scripted JSON edit. `gda_app` credential enforced. |
| F-026 overlap | Per-table reconciliation (12 overlapping tables) | F-026 Steps 2–4 | **NOT in F-026 scope.** Separate work item per table: `opportunities` vs `gda_opportunity_tracker`, `capture_plans` vs `gda_capture_plans`, `intel_items` vs `gda_intelligence_log`, etc. Each needs: which is authoritative, merge strategy, migration plan. |
| (F-026 parallel) | Migration 017 `bot_sources` seed correction | F-026 Step 3 | Correct "n8n webhook = primary source of truth" seeded language. Update `book-of-truths.ts` route. |
| (F-026 parallel) | Frontend "Live API" / "Live DB" relabel | F-026 Step 3 | Post-consolidation, the source distinction is meaningless. ~8 pages need relabeling. Backend `source: "n8n" \| "db"` response field cleanup. |
| F-023 | Shadow schema resolution (implementation) | F-026 Steps 2–4 | Fix path now defined: consolidation per F-026 sequencing. |
| F-028 | Contract enforcement (implementation) | F-028 audit | Routes now all read from `gda_command`. Enforcement follows the audit. |
| F-015 | Ingest mapper sanitization | F-026 Steps 2–4 | Mappers write to `gda_command` post-consolidation. |
| F-027 | E2E integration test suite | F-026 Steps 2–4 | Tests assert against `gda_command` as single source. |
| F-031 | Workflow consolidation (execution) | F-026 Steps 2–4, F-022 Subtask A | Archive/merge decisions need the consolidation complete and the webhook mapping. |
| F-032b | Security hardening (xlsx, webhook registry, health endpoints) | Nothing | RISK-002 (P1), RISK-003 (P2), RISK-004 (P3). None individually urgent but collectively represent unaddressed audit findings. |
| F-019 | Scope expansion | F-026 Steps 2–4 | Consolidation puts workflow tables under `gda_command` — F-019's manifest/drift check must cover them. |
| F-033 Phase 2 | AI knowledge corpus implementation + WIFCON first source | F-033 Step 0 + F-034 (embedding service) + Shawn approval | Ingest workflow for WIFCON, embedding pipeline (via F-034 embedding service), vector store, retrieval API endpoint (standard JSON envelope), pattern documentation for adding subsequent sources (FAR text, GAO decisions). |

### Tier 4 — Product Work

Features from the Master Doc §10 TODO and ON HOLD lists. Not before Tiers 1-2 are decided and
Tier 3 is substantially complete.

| Item | Depends On | Notes |
|---|---|---|
| Financial Bible / KPI strip | Shawn's financial data + F-026 | ON HOLD externally. Data path must work first. |
| Launchpad top 10 scoring | F-026, F-023 implementation | Scoring against 10 seed records is meaningless. Need real data flowing. |
| Ops Tracker with full data | F-026, F-023 implementation | 10 records vs. 1,757. |
| Auto-run Capture Coach (TODO #1) | F-026 | Capture plans table (0 in `gda_command`, 110 in n8n) must be accessible. |
| Proposal Center consolidation (TODO #2) | Product decision | Not blocked by infrastructure — pure UI/UX. Could start in Tier 3 if desired. |
| Company Intelligence Database (TODO #3) | F-026 | Competitor data tables are in n8n DB. |
| Shipley stage dropdown (TODO #4) | F-026 | `gda_opportunity_tracker` is in n8n DB. |
| Per-opp AI chat (TODO #5) | Product decision | Not data-path-dependent. Could start earlier. |
| STALE-001 (record_version empty) | F-009, F-026 | Versioning system needs retroactive snapshots + trigger verification with live data. |
| STALE-003 (1/23 docs embedded) | F-033 | Addressed by F-033 corpus foundation. Moved from Tier 4 to Tier 2 (inventory) / Tier 3 (implementation). |
| PERF-002/PERF-003 (code splitting) | None | Frontend performance. Independent. Can happen anytime. |
| DEAD-001/DEAD-002 (cleanup) | None | Repo hygiene. Lowest priority. |
| DOC-002 (API docs) | F-028 audit | API docs should follow the contract audit, not precede it. |

### Dependency Map — Items That Place Later Than Expected

| F-XXX | Expected Tier | Actual Tier | Why |
|---|---|---|---|
| F-023 (implementation) | Tier 1 (it's the "biggest" problem) | Tier 3 | Implementation is part of F-026 consolidation sequencing. Decision is locked; implementation follows Steps 2–4. |
| F-026 (implementation) | Tier 1 (it's a "decision") | Tier 3 | Decision is locked (Tier 1). Implementation (network bridge, schema migration, workflow repoint) is Tier 3 work with 5-step sequencing. |
| F-015 (mapper sanitization) | Tier 2 (it's a known gap) | Tier 3 | Mappers write to `gda_command` post-consolidation. Scoping can happen in Tier 2; fixes in Tier 3. |
| F-027 (E2E tests) | Tier 2 (tests should come early) | Tier 3 | Tests assert against `gda_command` post-consolidation. Test *methodology* can be defined in Tier 2; test *implementation* is Tier 3. |
| 12-table overlap reconciliation | "Part of F-026" | Tier 3 backlog (separate) | Explicitly scoped OUT of F-026 to keep consolidation bounded. Each table needs per-table authority/merge/migration decisions. |
| Product work | "We should be building features" | Tier 4 | Every data-dependent feature renders wrong data until the data path is fixed. Building product on a broken foundation is what got us here. |

### Tier Execution Summary

```
Tier 0 (now):        10 items — saveData verify (DONE), idiq bug (DONE), F-032a CORS (DONE),
                     F-029 cred audit (DONE), F-025a PDFs (DONE), F-020 role demotion (DONE),
                     intel-feed capture (pending 05/22), n8n CORS restriction, orphan
                     container cleanup, pgvector enable
Tier 1 (LOCKED):     2 decisions — F-025b (PostgreSQL is truth), F-026 (consolidate to gda_command)
Tier 2 (parallel):   7 items — F-028 audit, F-022 Subtask A + consumer corrections, F-030,
                     F-014 scope, F-016 scope, F-033 Step 0 (corpus inventory),
                     F-034 (AI infra: LiteLLM + embeddings + Langfuse)
Tier 3 (after T0):   12 items — F-026 Steps 2-4 (consolidation impl), 12-table overlap
                     reconciliation, migration 017 correction, frontend relabel, F-023 impl,
                     F-028 impl, F-015, F-027, F-031, F-032b security, F-019 expansion,
                     F-033 Phase 2 (corpus + WIFCON, depends on F-034 embedding service)
Tier 4 (after T3):   11+ items — all product work, cleanup, docs (STALE-003 moved to F-033)
```

---

*This document is a sequencing plan, not a design document. Architecture decisions (F-025b,
F-026) were locked by Shawn on 2026-05-19. F-026 implementation follows the 5-step sequencing
defined in Section 4. Time estimates are intentionally omitted — ordering is determined by
dependencies and risk, not calendar.*
