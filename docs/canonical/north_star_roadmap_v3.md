# GDA Command North Star Roadmap — V3 Edition

**Date:** June 3, 2026 (updated — Phases 1–5 ALL COMPLETE; F-450 → F-452 Pwin scoring chain shipped; GovTribe + GovWin ingest fixed; main HEAD 6747741. NEXT: Phase 6 frontend rewire F-460 — live UI is frozen May 9 on the OLD n8n schema and must be repointed at backend-v3)
**Owner:** Shawn Seffernick
**Replaces:** north_star_roadmap_v3.md (June 1, 2026)
**Project Space:** GDA Rebuild
**main HEAD at this update:** `6747741`

---

## Where we stand right now (June 3, 2026)

The unified opportunity foundation (Phase 1) and the external MCP epic (F-500) are done. All five phases are complete. Live data state:

- **SAM.gov ingest** — live and healthy: **2,551 opportunities** in the unified DB, fully classified by notice type (solicitation, sources sought, pre-solicitation, award notice, special notice, justification).
- **GovTribe ingest** — **FIXED June 3 (PR #678)**: 349 rows inserted (run_id=57). Root cause: `fetchOppDetailBatches` only handled `{ results: [] }` shape; GovTribe MCP returns `{ data: [] }`, `{ rows: [] }`, and bare arrays too. Fixed via `extractResultsArray<T>()` helper.
- **GovWin ingest** — **FIXED June 3 (PRs #679/#680)**: 50 rows inserted (run_id=61). Uses OAuth2 **password grant** (`grant_type=password`, `scope=read`), token endpoint `https://services.govwin.com/neo-ws/oauth/token`. Sort: `updatedDate`, pagination: `max` (max 100). Column names: `tgt_hash`/`last_refresh_at`.
- **SBIR ingest** — rebuilt on the live DoD DSIP API: **131 open topics** live, daily cron `0 9 * * *`.
- **NSF ingest** — deployed, daily cron `0 8 * * *`, constraint fix applied.
- **DoD Contract RSS ingest** — live: **30 daily contract roll-ups** from war.gov, daily cron `30 22 * * *`.
- **NIH RePORTER ingest** — live: **200 defense/tech research awards**, weekly cron `0 7 * * 1`.
- **arXiv ingest** — live: **200 defense/tech pre-prints**, weekly cron `0 6 * * 1`.
- **USAspending ingest** — FIXED and live: **10,185 DoD award rows** (was 0; fixed `date_type: last_modified_date` + 7-day window).
- **Legacy `gda` database** — fully decommissioned; V3 now runs standalone on `gda_command_staging`.
- **Pwin scoring engine** — calibrated and live: 6 genuine forecast-band fits (DoD ops/sustainment/engineering services), recompete signal wired (+8), named-incumbent extraction active.

---

## Master task list (start to finish)

### Phase 1: Unified opportunity foundation ✅ COMPLETE
- ✅ F-317 — langgraph dep pin
- ✅ F-322 — dep audit clean
- ✅ F-321 — docker-compose env vars
- ✅ F-319 — rag_ready health check
- ✅ F-401 — unified opportunities schema
- ✅ F-323 — GovTribe REST → MCP rewrite
- ✅ F-402 — SourceAdapter refactor
- ✅ F-318 — GovTribe E2E smoke test
- ✅ F-403 — Matcher v1
- ✅ F-404 — Backfill legacy opportunities
- ✅ F-320 — govtribe_search agent tool
- ✅ F-405 — Field merge service

### Phase 1.5: MCP server (F-500 epic) ✅ COMPLETE
- ✅ F-501 — MCP server skeleton
- ✅ F-502 — First 5 MCP tools
- ✅ F-503 — Next 5 MCP tools
- ✅ F-504 — Deploy MCP server to VPS (`gda-mcp.csr-llc.tech`)
- ✅ F-505 — Claude Desktop + Cursor configs
- ✅ F-506 — LegiScan bill search tool
- ✅ F-507 — gda_query_rag runtime fix (13 tools live)
- ✅ F-508 — gda_company_awards (USAspending.gov)
- ✅ F-509 — gda_company_financials (SEC EDGAR)

### Phase 2: Unified API ✅ COMPLETE
- ✅ F-410 — unified detail endpoint `GET /v3/opportunities/unified/:internal_id`
- ✅ F-411 — stage filter on list endpoint
- ✅ F-412 — suggestion queue for matcher review
- ✅ F-413 — field override endpoint with audit

### Phase 3: Unified UI ✅ COMPLETE
- ✅ F-420 — unified detail page (route `/unified/:internal_id`, PR #637, live)
- ✅ F-420a — per-field source URLs + unified analyze endpoint (PR #639, live)
- ✅ F-421 — tab structure with say-something surfaces (PR #641, live)
- ✅ F-422 — suggestion review UI / Review Matches tab (PR #643, live)
- ✅ F-423 — decommission old per-source detail routes (PR #645, live — 807 deletions, fallback-to-list pattern)
- ✅ F-314 — V1/V2 teardown COMPLETE (legacy `gda` DB + stale VPS artifacts removed; CI guard `no-phantom-backend.yml` enforces)

### Phase 4: Fast Track data sources ✅ COMPLETE (7 sources live + scoring + badge)
- ✅ **F-430 — NSF Awards** — deployed, daily cron `0 8 * * *`, constraint fix applied
- ✅ **F-431 — SBIR (DoD DSIP)** — rebuilt on live DSIP API, 131 topics live, daily cron `0 9 * * *`
- ✅ **F-432 — SAM Sources Sought + notice-type classification** — live, 196 sources-sought classified + tagged
- ✅ **F-433 — DoD Contract RSS** — live, 30 daily roll-ups from war.gov, daily cron `30 22 * * *`; migration v3_029 fixed NSF constraint gap
- ✅ **F-434 — NIH RePORTER** — live, 200 defense/tech research awards, weekly cron `0 7 * * 1`; migration v3_030
- ✅ **F-435 — arXiv + USAspending** — arXiv 200 pre-prints (weekly); USAspending fixed 0→10,185 DoD awards; migration v3_031
- ✅ **F-436 — NAICS-aware signal scoring** — SBA size-standards lookup, NAICS size dimension, `recommendStatus()` promotion helper (≥70 forecast, ≥45 signal); PR #660
- ✅ **F-437 — Doctrine match badge** — 8 GDA principles surfaced in detail payload + MCP; fault-isolated; PR #661

### Phase 5: Hardening + analytics ✅ COMPLETE
- ✅ **F-440 — LOW-confidence near-duplicate matcher** — STRONG (shared solicitation key) + WEAK (fuzzy title ≥0.80 within naics/agency) tiers; `GET /v3/opportunities/dup-candidates`; 162 STRONG + 1,023 WEAK pairs surfaced; PR #662
- ✅ **F-441 — Conversion funnel report** — `GET /v3/reports/funnel` (lifecycle funnel + signal bands + decision activity); graceful on empty data; PR #664
- ✅ **F-442 — Unified review/decision audit log** — migration v3_032; `recordAuditLog()` wired into match-suggest decide + field-override; `GET /v3/audit-log`; PR #663
- ✅ **F-443 — Bulk review tools** — `POST /v3/match-suggestions/bulk` (≤200 items, dedup, per-item isolated, audited); PR #665
- ✅ **F-450 — Corpus triage + real Pwin scoring** — feature-extraction layer + batch scorer + 30-day pass bucket; `POST /v3/pwin/batch-score`; 3,711 scored: 2,389 pass / 1,266 discovery / 56 signal; PR #666
- ✅ **F-451 — Pwin feature enrichment** — `envision-profile.ts` + `deriveSignals()` (scope/vehicle/clearance/recompete/customer); pure doctrine scoring reuse; PR #667
- ✅ **F-451.1 — Calibrate enrichment** — broaden customer/mission/offering keywords to real solicitation language + soften scope tiers + NAICS-lane baseline; PRs #668/#669
- ✅ **F-451.2 — Neutralize derived-but-unknown penalties** — vehicle/clearance false-unknown penalties 0 instead of −15/−10; forecast band populated: 1 genuine forecast (ops/sustainment 78); PR #670
- ✅ **F-451.3 — Recalibrate NAICS size signal** — large→0 (not a handicap in full-and-open); small bonus gated on actual set-aside; wire `is_existing_customer` +5; forecast 1→4; PR #671
- ✅ **F-451.4 — Lower forecast threshold 70→67** — clean 67→63 gap in live histogram captures engineering/ops fits; forecast 4→6; PR #672
- ✅ **F-452 — Wire recompete signal (+8) + named-incumbent extraction** — `is_recompete` wired at +8; strengthened keyword detection; `incumbent_competitor` field (informational); 5 genuine follow-ons carrying +8; forecast held at 6; PR #673. **Backend scoring engine now done.**

---

## What's next — Phase 6

### F-460 — GDA Command frontend rewire (NEXT MAJOR SPRINT)

**The problem:** the backend is solid, calibrated, deployed. But the **live frontend at `gda.csr-llc.tech` is frozen May 9, 2026** — it predates every recent backend change. It serves a React/Vite app backed by its OWN in-repo Node BFF (`src/api/routes/*`) that reads the **OLD n8n Postgres DB** (`gda_opportunity_tracker`, `pwin`/`score` as flat columns). It does NOT call backend-v3, has zero `/v3/` references, and cannot display any of the new scoring/bands/top_drivers/reports/review work.

**The fix:**
- **Rip out the in-repo BFF entirely** (`src/api/routes/*` + the n8n `pg.Pool`). That layer IS the v1/v2 contamination — deleted, not reused.
- **Point all React pages at backend-v3's `/v3/` endpoints** (JWT-protected, schema-validated).
- **Surface the new structured `analysis.pwin`** — score, band (forecast/signal/discovery/pass), top_drivers, days_to_due, model_version, incumbent_competitor — on Pipeline + OpportunityDetail.
- **Map each existing page to a v3 endpoint first** to find gaps; gaps become new backend-v3 endpoints.
- Deploy: build → static `dist` served from Hostinger; all data via `gda-v3.csr-llc.tech`.

**F-453 — Tunable Pwin weights + reset-to-defaults** — fold into F-460 (it is a frontend feature). New `pwin_scoring_config` table; scorer reads weights from config; GET/PUT `/v3/pwin/config` + POST `/v3/pwin/config/reset`; settings panel in UI with reset button.

### Known follow-ups / candidates (not yet ticketed)
- **Grants.gov adapter** — confirmed live during SBIR diagnosis; strong civilian SBIR/STTR + grants signal source.
- **Backfill notice-type classification** — ~2,398 older SAM rows still `opportunity_type=null`; will reclassify naturally through daily cron, or a one-time backfill.

---

## North Star (unchanged)

GDA Command is Shawn's operating system for emerging defense / DoD business development:
- **Opportunity intelligence** — what's coming, what's posted, what we should pursue
- **Capture coach** — per-opportunity strategy + gap analysis
- **Competitive intel** — who else is moving, when it matters
- **Daily commander briefing** — what matters today
- **Platform health** — say-something surfaces across every component

End state: **one detail page per opportunity, regardless of source, with doctrine-aware scoring and human-confirmed cross-source matching.**

---

## Architecture — current reality (June 3, 2026)

### Layer 1: Source ingestion
- **SAM.gov** — Get Opportunities Public API + Entity Management API; 2,551 opps, classified by notice type
- **GovTribe** — MCP over Streamable HTTP (Bearer JWT), 64 tools, cap 1,200/mo + 150/cycle; FIXED June 3 (PR #678, 349 rows)
- **GovWin** — OAuth2 **password grant** (`grant_type=password`, `scope=read`), token endpoint `https://services.govwin.com/neo-ws/oauth/token`, API base `https://services.govwin.com/neo-ws`. Sort: `updatedDate`. Pagination: `max` (max 100). Credentials: `sseffernick@pd-sys.net`. FIXED June 3 (PRs #679/#680, 50 rows)
- **SBIR (DoD DSIP)** — 131 open topics, daily cron `0 9 * * *`
- **NSF Awards** — daily cron `0 8 * * *`
- **DoD Contract RSS (war.gov)** — 30 roll-ups, daily cron `30 22 * * *`
- **NIH RePORTER** — 200 research awards, weekly cron `0 7 * * 1`
- **arXiv** — 200 pre-prints, weekly cron `0 6 * * 1`
- **USAspending** — 10,185 DoD awards, daily cron

### Layer 2: Unified opportunity model
- Single `opportunities` table keyed by internal UUID
- `lifecycle_stage` enum: `signal` → `forecast` → `pre_sol` → `solicitation` → `awarded` → `post_award` → `closed`
- `opportunity_links` — (source, source_native_id) with confidence (HIGH/MEDIUM/LOW/CONFIRMED/REJECTED)
- `opportunity_field_overrides` — human edits with precedence
- `opportunity_signals` — low-confidence early-stage signals

### Layer 3: Matching engine
- **HIGH:** exact notice_id match → auto-confirm
- **MEDIUM:** fuzzball title ≥0.85 + agency exact + (NAICS exact OR dollar band within 20%) → auto-link, surface for review
- **LOW:** deferred — F-440 surfaces dup candidates (162 STRONG + 1,023 WEAK pairs live)
- Precision targets: ≥0.95 HIGH, ≥0.85 MEDIUM

### Layer 4: Field merge
Precedence: human override > GovWin > SAM > GovTribe > Fast Track. Cached 60s per internal_id.

### Layer 5: Agent + cognition
- agent-v3 with langgraph; tool registry: `govwin_search`, `govtribe_search`, doctrine match, opportunity fetch
- RAG-backed retrieval (rag_ready surfaced via /healthz)
- Cycle/monthly budget enforcement; ledger-backed audit of every paid call
- **Pwin scoring engine:** feature extraction (`extractFeaturesFromOpportunity`) + `deriveSignals()` + `scoreV1Rules`. Live corpus: 3,711 scored — 2,431 pass / ~500 discovery / ~800 signal / **6 forecast** (genuine DoD ops/sustainment/engineering/support services). Deadline gate: opps within 30 days → `pass` bucket. Band written to `analysis.pwin` as `{score, band, top_drivers, days_to_due, model_version, scored_at}`. `status` never written by scorer (owner promotes only).

### Layer 6: UI
- frontend-v3 React (`packages/frontend-v3`) at `gda.csr-llc.tech`
- **WARNING: frontend FROZEN May 9 — still backed by old in-repo BFF on n8n DB.** F-460 rewires it to backend-v3. Until F-460 is done, the live UI does NOT show scoring/bands/fast-track data.
- 6-color palette only: Pink, Red, Black, Blue, White, Green. **No gold.**

### Layer 7: Infrastructure
- Hostinger VPS at `187.77.206.105`; Traefik reverse proxy
- Public surfaces: frontend `gda.csr-llc.tech`, backend `gda-v3.csr-llc.tech`, MCP `gda-mcp.csr-llc.tech`
- Docker Compose (`docker-compose.prod.yml`); single Postgres `gda_command_staging` (legacy `gda` DB removed)
- GitHub Actions CI: build/typecheck, integration tests, compose drift, migration parity, forbidden-token scan, Devin Review
- Devin-assisted development; Devin API currently returning **403** (June 3) — hold new sessions until resolved

---

## Definition of "GDA stable" — V3 edition

1. ✅ V3 stack healthy on VPS
2. ✅ SAM + GovWin + GovTribe ingest operational with real transactions proven
3. ✅ Repo and VPS infra aligned (no drift); legacy DB removed
4. ✅ CI gates all green
5. ✅ Credit ledger enforcing budget caps
6. ✅ Phase 1 unified opportunity foundation complete
7. ✅ Phase 1.5 MCP server complete (13 tools live)
8. ✅ Phase 2 unified API complete
9. ✅ Phase 3 unified UI complete
10. ✅ Phase 4 Fast Track adapters complete (7 sources + F-436 scoring + F-437 doctrine badge)
11. ✅ Phase 5 hardening + analytics complete (F-440–F-443 + F-450–F-452 Pwin chain)
12. ⏳ Phase 6 frontend rewire (F-460) — live UI reconnected to backend-v3

**Items 1–11 all met. Single remaining bar: Phase 6.**

---

*Canonical roadmap for GDA Command V3 as of June 3, 2026. Phases 1–5 COMPLETE. Backend scoring engine done (F-452). GovTribe + GovWin ingest fixed. Devin API 403 (hold new sessions). NEXT = Phase 6 frontend rewire F-460: delete in-repo BFF, point React at /v3/ endpoints, surface new Pwin bands. Reload before any planning session.*
