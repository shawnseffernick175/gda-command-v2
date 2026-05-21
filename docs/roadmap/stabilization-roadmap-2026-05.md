# GDA Command v2 — Stabilization Roadmap

**Date:** 2026-05-21
**Author:** Devin (reviewed by Shawn Seffernick)
**Status:** DRAFT — pending Shawn's review
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

**Documents that do not exist:**
- `docs/rebuild/` — no rebuild charter, PRD, product roadmap, or stability standard as separate files
- These exist as PDFs in Shawn's project context but are NOT in the repo
- The Master Doc (§2 Core Rules, §6 Pages Built, §10 TODO, §14 Design Decisions) is the only
  in-repo destination definition

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

### Contradiction: Migration 017 vs. Core Rule 7

**Core Rule 7:** "PostgreSQL is truth."

**Migration 017 (Book of Truths), seeded into `bot_sources`:**
> "n8n live feeds are the primary data source. Local database is the fallback."
> "n8n webhook = primary source of truth for opportunities"
> "Local DB = fallback and user-generated data"

These cannot both be operative:
- If PostgreSQL is truth (Rule 7), then `gda_command` should hold all authoritative data,
  workflows should write to it, and the migration system governs all schema.
- If n8n webhooks are primary (migration 017), then `gda_command` is a cache/fallback,
  authoritative data lives wherever n8n puts it, and the migration system doesn't govern
  workflow tables.

The current system operates as if migration 017 is true: DUAL-path routes try n8n webhook first,
fall back to DB. But the "GDA Postgres" credential misconfiguration means the DB fallback hits
empty tables. **Neither document's vision is implemented correctly.**

**This contradiction requires Shawn's call.** The rebuild charter, PRD, and stability standard
PDFs are the **governing** documents per project rules. The Master Doc is current implementation,
not destination. F-025b surfaces where the Master Doc disagrees with the PDFs; Shawn rules on
each. See proposed F-025a/F-025b (Section 4) for the reconciliation work.

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

### F-025b: Reconcile Contradictions That Affect F-026

**Title:** Surface where GDA-COMMAND-MASTER-DOC.md disagrees with the governing PDFs; Shawn
rules on each.

**Description:** The rebuild charter, PRD, product roadmap, and stability standard PDFs are the
**governing** documents per project rules. The Master Doc is current implementation, not
destination. This task: (a) creates a reconciliation document noting where the Master Doc
disagrees with the PDFs, (b) flags specifically the Rule 7 "PostgreSQL is truth" vs. migration
017 "n8n webhook = primary source of truth" contradiction plus any PDF language about
system-of-record, (c) Shawn rules on each disagreement — this is not "reconcile and pick a
winner," it is "the PDFs are canonical, surface disagreements, I rule."

**Priority:** P0 — the architecture decision (F-026) cannot be made coherently if the destination
is incoherent.

**Dependency:** F-025a (PDFs must be in repo to reference). Blocks F-026.

### F-026: System-of-Record Architecture Decision

**Title:** Decide system-of-record architecture and resolve workflow→backend data path.

**Description:** F-023 discovered that all 323 n8n Postgres nodes use a "GDA Postgres" credential
pointing to `n8n-envision-postgres-1` (the n8n database), not `gda-v2-postgres` (the GDA backend
database). Zero backend routes read any workflow-produced table. The table naming conventions
don't even match (workflows use `gda_` prefix, backend uses unprefixed names). Three independent
decisions are tangled: (a) which Postgres holds application data, (b) how workflows communicate
output to the backend, (c) what "PostgreSQL is truth" means when two Postgres instances exist.
This task surfaces the decision with full evidence and gets Shawn's call. It does NOT implement
the decision — implementation is Tier 3.

**Priority:** P0 — every DUAL-path route, every workflow consumer claim, and every downstream
fix depends on this decision.

**Dependency:** F-025b (reconciliation of governing PDFs vs. Master Doc — needed to know what
"PostgreSQL is truth" actually means per the canonical destination).

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

---

## Section 5: The Ordering

### Tier 0 — Stop the Bleeding

Items that must happen before any new work. Small, urgent, no architecture decisions required.

| F-XXX | Item | Status | Rationale |
|---|---|---|---|
| (cleanup) | `saveDataSuccessExecution` flip for remaining workflows | **Done** (F-024 follow-up) | Observability prerequisite. Already executed. |
| (cleanup) | `gda_idiq_tracker` CHECK constraint bug fix | **Open** | Live bug: `DEFAULT 'monitoring'` violates `CHECK (holder, teaming, targeting)`. Every INSERT using default value fails. Fix in workflow SQL today. Re-apply as migration if F-026 consolidates workflow tables into `gda_command`. |
| (cleanup) | intel-feed persistent daily error capture | **Open** | 3 consecutive 08:00 UTC errors with execution data pruned. `saveDataSuccessExecution` now set to `all` — next error will be capturable. Diagnosis pending. |
| F-032a | CORS fix | **Open** | CORS allows all origins — P0 from Phase 4 audit (RISK-001). 30-minute fix. Restrict to `gda.csr-llc.tech`. Does not wait for architecture decisions. |
| F-029 | Credential and configuration audit | **Open** | Read-only. If the most critical credential was wrong, what else is? Trust is zero until credentials are validated. No architecture dependency. If this surfaces another F-023-class wound, we need to know before F-026 decisions get baked in. |

### Tier 1 — Foundational Decisions

Architecture calls that everything else depends on. No implementation — just decisions documented.

| F-XXX | Item | Depends On | Rationale |
|---|---|---|---|
| F-025a | Commit rebuild PDFs to repo | Nothing | 15-minute task. PDFs are the governing documents — they must be in the repo. |
| F-025b | Reconcile contradictions affecting F-026 | F-025a | The destination must be coherent before we can sequence toward it. The Rule 7 vs. migration 017 contradiction must be resolved. PDFs are canonical; surface where Master Doc disagrees; Shawn rules. |
| F-026 | System-of-record architecture decision | F-025b | Which database holds truth? How do workflows deliver data to the backend? Every data-path fix downstream depends on this answer. |
| F-020 | Role demotion (`gda` NOSUPERUSER) | Nothing — **confirmed unblocked** | All 323 Postgres nodes target `n8n-envision-postgres-1`. Zero DDL against `gda_command`. Docker networks are isolated. Demotion is safe. Foundational security control that makes deploy guard (F-019) enforceable. |

**Within tier — parallel tracks:**
- Track A: F-025a → F-025b → F-026 (sequential — PDFs in repo → reconcile contradictions → architecture decision)
- Track B: F-020 (confirmed unblocked — role demotion is infrastructure, not architecture)

### Tier 2 — Foundation Work / Inventories

Read-only or low-risk write work that surfaces what's broken without changing it.

| F-XXX | Item | Depends On | Rationale |
|---|---|---|---|
| F-028 | Backend route contract audit (inventory phase) | Nothing | Maps every route's response format, database reads, and frontend usage. The audit portion is read-only. |
| F-022 | Webhook dependency mapping (Subtask A) + consumer claim correction | Nothing | 124 webhook workflows still unclassified. Read-only triage. **Explicit deliverable:** correct the 7 keep-and-fix workflows whose consumer claims were invalidated by F-023 (claimed "backend SQL reads" that hit empty tables in `gda_command` — actual working consumer is n8n webhook chain). Produce corrected triage doc. |
| F-030 | Frozen workflow review | F-024 (done) | Check whether freeze reasons still hold post-upgrade. Read-only assessment. |
| F-014 | Cross-file type-safety in migrations (scope) | Nothing | Was skipped without justification. At minimum, scope it: what does "cross-file type-safety" mean concretely, what would a check look like, how many migrations are at risk? |
| F-016 | Schema-mapper drift detection (scope) | F-026 | Scoping depends on the architecture decision — if workflows consolidate into `gda_command`, the mapper-to-schema check looks different than if the split-brain is formalized. |

### Tier 3 — Targeted Fixes

Address what inventories surface. Implementation work.

| F-XXX | Item | Depends On | Rationale |
|---|---|---|---|
| F-023 | Shadow schema resolution (implementation) | F-026 | The fix path (credential change, data migration, table consolidation, workflow DDL removal) depends entirely on the Tier 1 architecture decision. |
| F-028 | Contract enforcement (implementation) | F-026, F-028 audit | Routes serving workflow data need to know which database to query. Enforcement follows the audit. |
| F-015 | Ingest mapper sanitization | F-026 | Mapper fixes may change depending on whether mappers write to `gda_command` or to n8n DB. |
| F-027 | E2E integration test suite | F-026 | Tests need to know the expected data path to assert against. |
| F-031 | Workflow consolidation (execution) | F-026, F-022 Subtask A | Archive/merge decisions need the architecture decision and the webhook mapping. |
| F-032b | Security hardening (xlsx, webhook registry, health endpoints) | Nothing | RISK-002 (P1), RISK-003 (P2), RISK-004 (P3). None individually urgent but collectively represent unaddressed audit findings. |
| F-019 | Scope expansion (if needed) | F-026 | If the architecture decision puts workflow tables under `gda_command`, F-019's manifest/drift check needs to cover them. |

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
| STALE-003 (1/23 docs embedded) | Product decision | RAG quality. Independent of infrastructure. |
| PERF-002/PERF-003 (code splitting) | None | Frontend performance. Independent. Can happen anytime. |
| DEAD-001/DEAD-002 (cleanup) | None | Repo hygiene. Lowest priority. |
| DOC-002 (API docs) | F-028 audit | API docs should follow the contract audit, not precede it. |

### Dependency Map — Items That Place Later Than Expected

| F-XXX | Expected Tier | Actual Tier | Why |
|---|---|---|---|
| F-023 (implementation) | Tier 1 (it's the "biggest" problem) | Tier 3 | Implementation depends on F-026 architecture decision. The inventory/analysis is Tier 1 work; the fix is Tier 3. |
| F-015 (mapper sanitization) | Tier 2 (it's a known gap) | Tier 3 | Mapper target database depends on F-026. Scoping can happen in Tier 2; fixes in Tier 3. |
| F-027 (E2E tests) | Tier 2 (tests should come early) | Tier 3 | The tests need to know the expected data path, which isn't decided until F-026. Test *methodology* can be defined in Tier 2; test *implementation* is Tier 3. |
| Product work | "We should be building features" | Tier 4 | Every data-dependent feature renders wrong data until the data path is fixed. Building product on a broken foundation is what got us here. |

### Tier Execution Summary

```
Tier 0 (now):        5 items — idiq bug, intel-feed capture, F-032a CORS, F-029 cred audit, saveData cleanup (done)
Tier 1 (next):       3 items — F-025a, F-025b, F-026 (+ F-020 in parallel, confirmed unblocked)
Tier 2 (parallel):   5 items — F-028 audit, F-022 Subtask A + consumer corrections, F-030, F-014 scope, F-016 scope
Tier 3 (after T1):   7 items — F-023 impl, F-028 impl, F-015, F-027, F-031, F-032b security, F-019 expansion
Tier 4 (after T3):   12+ items — all product work, cleanup, docs
```

---

*This document is a sequencing plan, not a design document. It does not propose how to implement
any item — only what order to address them in. Architecture decisions (F-025b, F-026) are Shawn's
calls. Time estimates are intentionally omitted — ordering is determined by dependencies and risk,
not calendar.*
