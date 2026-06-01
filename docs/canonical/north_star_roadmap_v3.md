# GDA Command North Star Roadmap — V3 Edition

**Date:** June 1, 2026
**Owner:** Shawn Seffernick
**Replaces:** `gda-north-star-roadmap.md` (April 27, 2026)
**Project Space:** GDA Rebuild

---

## What's different from the April 27 roadmap

The April version described a stabilization plan: deploy the React QA Center, build an API Gateway, standardize n8n response envelopes, get the React source under version control. **All of that is done or no longer the architecture.** GDA Command is now a V3 native stack (backend-v3 + agent-v3 + frontend-v3) running on Hostinger VPS with Traefik, Docker, Postgres-staging, and direct Devin-assisted development.

The center of gravity has shifted from "stabilize the n8n + Retool prototype" to **"build the unified opportunity intelligence platform."** The April roadmap is now historical context.

---

## The North Star (unchanged)

GDA Command becomes Shawn's operating system for emerging defense / DoD business development:
- Opportunity intelligence — what's coming, what's posted, what we should pursue
- Capture coach — for each pursued opportunity, what's the strategy + what's missing
- Competitive intel — who else is moving, when does it matter
- Daily commander briefing — what matters today
- Platform health — say-something surfaces across every component

The end state is **one detail page per opportunity, regardless of source, with doctrine-aware scoring and human-confirmed cross-source matching.**

---

## Architecture — current reality (June 1, 2026)

### Layer 1: Source ingestion
- **SAM.gov** — Get Opportunities Public API + Entity Management API (read-only key in Devin store, active SAM entity registration)
- **GovTribe** — MCP over Streamable HTTP (Bearer JWT), 64 tools discovered, $0.039–$0.09/credit pricing, self-imposed cap 1200/mo + 150/cycle, real-spend confirmed today at 3 credits per opportunity search
- **GovWin** — CAS portal auth (username+password), Iron portal login, no Deltek OAuth tier
- **Fast Track sources** (Phase 4) — SBIR, SAM Sources Sought + Pre-Sol, NIH RePORTER, NSF Awards, USAspending, DARPA/ONR BAA, DoD RSS, arXiv

### Layer 2: Unified opportunity model
- Single `opportunities` table keyed by internal UUID
- `lifecycle_stage` enum: `signal` → `forecast` → `pre_sol` → `solicitation` → `awarded` → `post_award` → `closed`
- `opportunity_links` ties internal_id to (source, source_native_id) with confidence (HIGH/MEDIUM/LOW/CONFIRMED/REJECTED) and match_method
- `opportunity_field_overrides` for human edits with precedence
- `opportunity_signals` for low-confidence early-stage signals (academia, FedReg, GAO, news)

### Layer 3: Matching engine
- **HIGH:** exact notice_id match → auto-confirm
- **MEDIUM:** fuzzball title similarity ≥ 0.85 + agency exact + (NAICS exact OR dollar band within 20%) → auto-link, surface in review queue
- **LOW:** deferred — F-440 surfaces them as candidates only
- Precision targets: ≥ 0.95 HIGH, ≥ 0.85 MEDIUM

### Layer 4: Field merge
Precedence stack: human override > GovWin > SAM > GovTribe > Fast Track. Cached 60s per internal_id, invalidated on override write.

### Layer 5: Agent + cognition
- agent-v3 with langgraph
- Tool registry: `govwin_search`, `govtribe_search` (F-320, pending), doctrine match, opportunity fetch
- RAG-backed retrieval (rag_ready surfaced via /healthz as of F-319)
- Cycle/monthly budget enforcement, ledger-backed audit of every paid call

### Layer 6: UI
- frontend-v3 React
- Single `/opportunities/:internal_id` detail page (Phase 3)
- Tab structure: Lifecycle / Sources / Matching / Doctrine / Signals
- Say-something surfaces on every tab — 10-second comprehension rule
- 6-color palette only: Pink, Red, Black, Blue, White, Green. **No gold.**

### Layer 7: Infrastructure
- Hostinger VPS at 187.77.206.105
- Traefik reverse proxy (`gda-v3.csr-llc.tech`)
- Docker Compose (`docker-compose.prod.yml`) — repo and VPS aligned as of F-321 today
- Postgres-staging (port 5433, `gda_command_staging`)
- GitHub Actions CI: dep audit, integration tests, compose drift check, env parity
- Devin-assisted development with explicit-go merge policy (with clean-CI auto-merge exception authorized today)

---

## Today's progress (June 1, 2026) — Phase 1 foundation sprint

9 PRs merged to main, real GovTribe MCP transaction proven end-to-end:

| PR | Ticket | What it did |
|---|---|---|
| #580 | F-317 | langgraph transitive dep pin |
| #592 | F-322 | dep audit clean (@fastify/static, vitest) |
| #601 | F-401 | unified opportunities schema + migrations + repo |
| #604 | F-323 | GovTribe REST → MCP rewrite, 64 tools discovered, 0 credits on dry-run |
| #590 | F-319 | rag_ready DB check + /healthz surface |
| #589 | F-321 | docker-compose env passthroughs (repo ↔ VPS aligned) |
| #606 | F-402 | SourceAdapter interfaces + SAM/GovWin/GovTribe refactor |
| #607 | F-318 | GovTribe E2E smoke test PASS (3 credits real spend) + saved-search endpoint + MCP client bug fix |
| #608 | F-403 | Matcher v1 (HIGH + MEDIUM) + 53 unit tests |

### Today's closures
- 6 stale PRs closed (#581, #588, #586, #585, #578, #383)
- F-440 closed (SAM already registered for months — no new clock to start)

### Today's PRs in flight
- **F-404 #611** — backfill script (Devin building)
- **F-320 #610** — agent-v3 `govtribe_search` tool (Devin building)
- **F-405** — field merge (queued for after F-404)

---

## Roadmap — current view

### Phase 0 — V3 stack stable (DONE before June 1)
- backend-v3 + agent-v3 + frontend-v3 containers healthy on VPS
- Traefik routing live
- SAM + GovWin ingest baseline operational
- Cognition stack online

### Phase 1 — Unified opportunity foundation (IN PROGRESS — ~60% done)
- ✅ F-401 schema
- ✅ F-402 SourceAdapter
- ✅ F-403 Matcher v1
- ⚙️ F-404 backfill (in flight)
- ⏳ F-405 field merge (queued)
- **Definition of done:** every opportunity in the system, regardless of source, lives in unified `opportunities` with at least one `opportunity_links` row, and the merge view returns a coherent record

### Phase 2 — Unified API
- F-410 unified detail endpoint `/api/opportunities/:internal_id`
- F-411 stage filter on list endpoint
- F-412 suggestion queue for MEDIUM/LOW review
- F-413 field override endpoint with audit trail
- **Definition of done:** frontend can ask for any opportunity by internal_id and get a fully merged response

### Phase 3 — Unified UI
- F-420 new `/opportunities/:internal_id` detail page
- F-421 tab structure with say-something surfaces
- F-422 suggestion review UI sidebar
- F-423 decommission old per-source detail routes
- **Definition of done:** old per-source detail pages gone, one canonical opportunity view across the app

### Phase 4 — Fast Track adapters
- F-430 NSF Awards (SignalAdapter)
- F-431 SBIR Awards + Topics (SignalAdapter + ForecastAdapter)
- F-432 SAM Sources Sought + Pre-Sol (ForecastAdapter, ptype=r,p)
- F-433 DoD Contract Announcements RSS (SignalAdapter)
- F-434 NIH RePORTER (SignalAdapter)
- F-435 arXiv + USAspending trend (SignalAdapter)
- F-436 Signal scoring (heuristic `signal` → `forecast` promotion)
- F-437 Doctrine match badge across all stages
- **Definition of done:** signals appear in `opportunity_signals` from at least 5 sources, scored, with doctrine-matched ones surfaced in the UI

### Phase 5 — Hardening + analytics
- F-440 LOW-confidence matcher
- F-441 conversion analytics — funnel `signal → forecast → pre_sol → solicitation → award`
- F-442 audit log — every link confirm/reject + field override
- F-443 bulk review tools
- **Definition of done:** Shawn can see conversion funnel + every cognition decision has an audit trail

---

## In-flight parallel tracks (not part of F-400)

- **F-320** — agent-v3 `govtribe_search` tool wrapping the MCP client (parity with `govwin_search`)
- **F-318 follow-ups** — saved-search runs endpoint now landed; MCP opp mapper alignment is the open follow-up (rowsInserted=0 issue caught during smoke test)

---

## Safety + governance (carried forward from April)

| Lane | Rule |
|---|---|
| Read-only | Safe to run from health checks |
| Dry-run | Safe only when `dry_run=true` honored |
| Test-row | Safe only with clearly marked QA test rows |
| Approval required | Sends, deletes, deploys, paid APIs, real production writes |
| Unknown | Do not automate. Inspect first. |

### Updates for V3
- **Code/schema PR merges:** Shawn-approved auto-merge for **clean rebased CI-green** PRs (authorized June 1, 2026). Anything UNSTABLE, with rebase conflicts, or touching risky areas (live table drops, secret rotation, infra teardown, V2 decommission) still requires explicit go.
- **Credential handling:** NEVER paste user secrets into chat. Length-only presence checks. Shawn-driven SSH terminal pattern for any credential the agent might need to verify.
- **Paid API calls:** every call writes a ledger row with decision (`called`/`skipped_low_budget`/`skipped_halted`/`skipped_cycle_cap`/`cached`) and cost. Cycle + monthly caps enforced in code.

---

## Definition of "GDA stable" — V3 edition

1. ✅ V3 stack (backend-v3 + agent-v3 + frontend-v3) healthy on VPS
2. ✅ SAM + GovWin + GovTribe ingest operational with real transactions proven
3. ✅ Repo and VPS infra aligned (no drift)
4. ✅ CI gates: dep audit, integration tests, compose drift, env parity all green
5. ✅ Credit ledger enforcing budget caps
6. ⏳ Phase 1 unified opportunity foundation complete (3 of 5 tickets done; F-404 + F-405 in flight)
7. ⏳ Phase 2 unified API complete
8. ⏳ Phase 3 unified UI complete
9. ⏳ At least 3 Fast Track adapters live (Phase 4)
10. ⏳ Conversion funnel report available (Phase 5)

**Items 1–5 are the GDA Command V3 stability bar — all met.**
**Items 6–10 are the unified opportunity build — Phase 1 nearly complete, Phase 2–5 ahead.**

---

## Operational tracks

### Today's must-watch (auto-pilot)
- F-404 backfill PR → auto-merge if clean
- F-320 govtribe_search PR → auto-merge if clean
- F-405 field merge fires after F-404 lands

### Shawn's personal must-do
- Nothing right now. SAM registration is already active. The build is on autopilot under the new merge rule.

### This week's targets
- Phase 1 complete (F-404 + F-405 land)
- Phase 2 API endpoints fired (F-410, F-411, F-412, F-413)
- F-318 MCP mapper follow-up (rowsInserted=0) resolved

### This month's targets
- Phase 3 unified UI live
- First Fast Track adapter (recommend SBIR — highest signal/cost ratio)
- First "say-something" surface tested by Shawn against a real opportunity

---

## Files this roadmap supersedes or extends

- `gda-north-star-roadmap.md` (April 27, 2026) — historical, now superseded
- `gda-rescue-map.md` — still authoritative for VPS access + emergency runbooks
- `gda-project-files-index.md` — file index, still authoritative
- `gda_unified_opp_architecture.md` (June 1, 2026) — full design doc for the F-400 epic
- `GDA_V3_Completion_Plan.md` — V3 completion plan (rev 4.1), still authoritative for V3-stack tactical work

---

*This document is the canonical roadmap for GDA Command V3 as of June 1, 2026. Reload before any planning session.*
