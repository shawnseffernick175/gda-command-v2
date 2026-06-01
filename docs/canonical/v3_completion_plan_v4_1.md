# GDA Command V3 — Completion Plan (rev 4.1)

**Date:** June 1, 2026 (Monday, 9:21 AM EDT)
**Status:** Cognition batch DEPLOYED and HEALTHY on VPS. F-317 langgraph dep fix landed. F-318 GovTribe smoke test in flight with Devin (dry-run only — hard stop before live spend).
**Authority:** Shawn Seffernick approved rev 2.1; this is the live status update

---

## Rev 4.1 changes (Mon morning June 1)

### GovTribe credit economics LOCKED IN (Mon Jun 1, 11:42 AM)

Real credit consumption table pulled from Shawn's account. Pricing model confirmed:

- **PAYG rate:** $0.09 / credit
- **3,500-credit pack (purchased today):** $239 = $0.068/cr (24% cheaper)
- **25,000-credit pack:** $979 = $0.039/cr (57% cheaper) — recommended next purchase
- **No GovTribe-side monthly cap.** No-use = no charge.

V3 saved-search cost projections (7 searches, Mon+Thu × 4 = 8 cycles/month):

| Scenario | Credits/cycle | Credits/month | PAYG cost | 25k-pack cost |
|---|---|---|---|---|
| 50 results/search (V2 doc) | 115 | 920 | $82.80 | $35.88 |
| 100 results/search | 230 | 1,840 | $165.60 | $71.76 |
| 200 results/search | 460 | 3,680 | $331.20 | $143.52 |
| **Hard cap (our code)** | **150** | **1,200** | **$108** | **$46.80** |

May 2026 actual burn was ~$840 / ~9,300 cr — almost entirely manual usage pre-V3. V3 going live adds at most 920–1,200 cr/mo on top. The 3,500-credit pack lasts ~3.8 months at V3 conservative burn, ~10 days at manual+V3 combined burn.

See `govtribe_credit_table.md` in workspace for the full per-endpoint credit rates (pulled from Shawn's logged-in account 2026-06-01 11:41 ET).

### Rev 4.0 → 4.1 changes


- **F-315a/b/c/d (Migration Runner, agent-v3 compose, Deploy Audit, CI Hang Fix)** — all 4 merged this morning (#574, #570, #571, #576). Auto-deploy fired green, VPS at HEAD `1fff9f7`.
- **F-Govtribe-Fix (#565)** — merged. credits_budget default = 1200, cycle cap = 150, Mon+Thu 6am ET cadence, 7 saved searches.
- **F-317 (#579 → PR #580)** — agent-v3 langgraph transitive dep pin. langgraph-prebuilt floated to 1.0.1 (incompat with 0.4.7). Now pinned to 0.2.3. /healthz reports versions per say-something principle. **MERGED and DEPLOYED 13:08 UTC.**
- **agent-v3 NOW HEALTHY** on VPS with /healthz returning `{ok:true, ready:true, langgraph:"0.4.7", langgraph_prebuilt:"0.2.3", 11 tools loaded}`.
- **F-318 (#582)** — GovTribe + Cognition E2E smoke test plan filed. Devin session `d2261ae3671849df85e08a44021760a9` running steps 1-6 (key entry → dry-run only). Will STOP before the 15-credit live call.
- **Two gaps surfaced via /healthz, filed as follow-ups:**
  - **F-319 (#583)** — `rag_ready: false` despite 218-chunk seed; likely hard-coded placeholder in main.py healthz handler.
  - **F-320 (#584)** — `govtribe_search` missing from agent tool registry (only `govwin_search` present). Backend connector exists; agent tool wrapper not added.
- **Connector keys (GOVTRIBE_API_KEY, GOVWIN_CLIENT_ID, GOVWIN_CLIENT_SECRET):** Devin has the secrets, wiring them now to /root/gda-command-v2/.env.prod with perms 600. Awaiting Devin report.

---

## Top-Line Status

| Metric | Count |
|---|---|
| **PRs merged tonight** | **10** |
| **PRs open + in flight** | **0** |
| **PRs queued for spec only (no code yet)** | 11 (+1 correction issue #563) |
| **Devin sessions active** | 0 |
| **Lines of V3 code merged tonight** | ~16,800+ |
| **Deploy status** | **NOT DEPLOYED — VPS running 2-hour-old build (pre-Cognition)** |

---

## Section A — Merged PRs (PRODUCTION on main)

### Tonight's V3 Cognition + R1 Surface batch (May 31 evening — ALL 10 MERGED)

| # | PR | Commit | Title |
|---|---|---|---|
| 1 | **#540** | `49ef1a9c` | docs(v3-cognition): Completion Plan + 15 specs + 218-chunk RAG corpus seed |
| 2 | **#555** | `b68b7d22` | F-260b: Regulatory Notices surface (Federal Register) — first R1 gold-standard surface |
| 3 | **#557** | `88a7c386` | F-Govtribe: GovTribe Connector (paid API, credit-aware) — **defaults need correction (#563)** |
| 4 | **#560** | `9b88c1f0` | F-300: Agent Runtime service (gda-agent-v3) — LangGraph + 11-tool registry |
| 5 | **#556** | `b37c1177` | F-303: Doctrine Rules Engine — 8 principles + 6 exclusions + 8% margin + evidence A/B/C |
| 6 | **#561** | `3c7b6e69` | F-Govwin: GovWin IQ Connector (CAS auth) |
| 7 | **#558** | `20c725de` | F-302: Decision Memory + Learning Loop — agent_decisions + pwin_features + outcomes |
| 8 | **#559** | `d7e7d8e9` | F-301: RAG knowledge base — pgvector + ingest + search + admin UI |
| 9 | **#562** | `b6f23c48` | F-Color-Team-Reviews: 6-Color Review (Pink/Red/Black/Blue/White/Green — GOLD REJECTED) |
| 10 | **#554** | `6037b785` | F-260a: Awards surface (USAspending) in V3 UI |

### Earlier today (May 31, ingest framework)

| PR | Commit | Title |
|---|---|---|
| #484 | `df858e4f` | F-236: V3 nginx proxy + remove V2 from compose + deploy container recreate fix |
| #486 | `b732088e` | F-238: Wire Left Rail navigation + fix HTML entity rendering |
| #489 | `56f3dff1` | F-239: Replace placeholder citations with real metric-specific sources |
| #490 | `2a9bce24` | F-237: Deploy auto-applies pending V3 migrations BEFORE backend recreate |
| #491 | `e7356359` | F-237 follow-up: fix migrate output pattern + PGPASSWORD extraction |
| #493 | `fa9e291a` | F-240: SAM.gov backend cron ingest + ingestion framework |
| #496 | `08536606` | F-222: Phase 3 Surface 2 — Fast Track |
| #497 | `70ec928b` | F-240b: Relocate ingest framework to apps/backend-v3/ |
| #502 | `973c5dda` | F-251: Archive pre-V3 documentation directories |
| #503 | `b5139661` | F-252: Delete 125 root-level binary files |
| #504 | `f0574659` | F-250: Delete phantom Docker configs + extend CI guard |
| #505 | `dd6efc37` | F-253: Orphan code audit report |
| #509 | `6a46a883` | F-254: Execute F-253 orphan audit (1 DELETE, 17 ARCHIVE) |
| #510 | `c4583ce1` | F-241: FPDS daily awards ingest |
| #511 | `94741b1b` | F-243: DIBBS + NECO defense small-buy ingest |
| #514 | `6d8aa9d2` | F-241b: Pivot awards ingest to USAspending.gov (FPDS decommissioned) |
| #515 | `5ad519bc` | F-243b: Disable DIBBS + NECO crons (DoD network blocks VPS egress) |
| #519 | `35ca72a5` | F-241c: USAspending group-split fetch — fix 422 on award_type_codes |
| #520 | `03ba9ecc` | F-241c follow-up: include degraded status in getIngestStatus |
| #521 | `15c5a248` | F-242: Federal Register regulatory notices ingest |
| #522 | `4e81fed0` | F-244: SBIR/STTR awards + open topics ingest |
| #524 | `45e188a4` | F-241d: USAspending one-shot 30-day backfill |
| #526 | `21710438` | F-242b: Federal Register agencies param format fix |
| #528 | `4536a51e` | F-244b: Gate SBIR cron behind ENABLE_SBIR_INGEST flag |
| #530 | `68273ce2` | F-242c: Federal Register agency slugs fix (OFPP + OMB) |
| #532 | `1e899881` | F-242d: Extend sources_kind_check enum for federal_register |

**Total V3 PRs merged today: 36** (10 from tonight's Cognition batch + 26 earlier ingest/infra)

---

## Section B — Open PRs

**None.** All Section B PRs landed on main tonight.

### B1. Stale (separate triage)

| PR | Title |
|---|---|
| #383 | hotfix(F-107): idempotent ALTER for Sprint 2/3 tables — CONFLICTING, May 30 vintage, separate triage |

---

## Section B-Deploy — VPS Deployment (NOT YET DONE)

**Hard hold:** requires explicit Shawn "go" per standing rule on production secret reads + V2-adjacent changes.

### Current VPS state
- `gda-frontend-v3` + `gda-backend-v3` — running 2-hour-old build (pre-Cognition merges)
- `gda-postgres-staging` — schema at v3_016 (before tonight's 5 migrations)
- `gda-agent-v3` Python service — **not running** (never deployed)
- `GOVTRIBE_API_KEY` env — **not set**
- `GOVWIN_CLIENT_SECRET` env — **not set** (only `GOVWIN_CLIENT_ID` exists)

### Deploy checklist (when Shawn says go)
| # | Step | Owner | Risk |
|---|---|---|---|
| 1 | **HOLD until #563 lands** (correct GovTribe defaults to 1,200/mo cap + Mon+Thu cadence) | Devin | HIGH — wrong defaults will overburn |
| 2 | `git pull` on VPS — pull tonight's 10 commits | Shawn | low |
| 3 | Apply migrations v3_017 → v3_022 against `gda-postgres-staging` (Govtribe, Doctrine, Decision Memory, RAG, Color Team, Govwin) | deploy script | MEDIUM — 5 migrations stacking |
| 4 | Stand up `gda-agent-v3` container (port 8001, gda Docker network) | docker-compose | MEDIUM — new service |
| 5 | Set `GOVTRIBE_API_KEY` on VPS `.env` | **Shawn manual** | gated |
| 6 | Set `GOVWIN_CLIENT_SECRET` on VPS `.env` | **Shawn manual** | gated |
| 7 | Rebuild + restart V3 containers (`docker compose up -d --build`) | deploy script | low |
| 8 | Smoke test: `/v3/govtribe/health`, `/v3/govwin/health`, `/v3/agent/healthz`, `/v3/rag/search`, `/v3/doctrine/principles` | Shawn | n/a |
| 9 | Watch first cron tick — GovTribe Mon 6am ET, all others scheduled | monitoring | medium |

**Recommendation: do NOT deploy tonight.** Do #563 first, then deploy in daylight.

---

## Section C — Queued (specs filed, no code yet)

All 11 issues below have specs in `docs/v3-cognition/` (merged in #540). They are NOT `devin-ready` — they depend on Section B PRs landing first.

| Issue | Spec file | Blocks on | Status |
|---|---|---|---|
| #543 | F-304-spec.md — Universal Ingestion (drag-drop + email-in) | F-300, F-301 | Pending |
| #544 | F-305-spec.md — Opportunity Auto-Analysis on Open (R2 — full analysis) | F-300, F-301, F-302, F-303 | Pending |
| #545 | F-306-spec.md — Capability Matching against OU3 Offerings | F-300, F-301, F-303 | Pending |
| #546 | F-307-spec.md — Risks as First-Class Objects (Launchpad roll-up) | F-300, F-302 | Pending |
| #547 | F-308-spec.md — Launchpad Daily News + What Needs Me Today + Day-1 Banners | F-300 (OrangeSlices = FORMAT only) | Pending |
| #548 | F-309-spec.md — Sentinel Handoff Monitor (plain language + GovTribe pacing) | F-Govtribe ✅, F-Govwin | Pending |
| #549 | F-310-spec.md — Action Item Tracker with AI Drafts | F-300 ✅, F-302 | Pending |
| #550 | F-311-spec.md — Financial Bible (PD-SYS 4-file, Envision-OU scoped) | F-301 | Pending |
| #551 | F-312-spec.md — Partner Profiles (Riverstone + PD Systems read-only) | F-301 | Pending |
| #552 | F-313-spec.md — Output Generators (Briefing / Capture Plan / Win Themes) | F-300 ✅, F-301, F-302, F-303 | Pending |
| #553 | F-314-spec.md — V2 Decommission + final cutover | All above + **HARD HOLD: explicit Shawn go required** | Pending |

---

## Section D — Operational State

### Doctrine + canonical rules (active enforcement)

- **6 colors only:** Pink, Red, Black, Blue, White, Green — GOLD rejected at compile + runtime + test (PR #562 verifies)
- **OrangeSlices:** FORMAT reference for Daily News only — NEVER ingested
- **GovWin:** Company-paid (Envision/CSR), **CAS auth not OAuth2** (Devin discovered, fix in #561)
- **GovTribe:** **Shawn-paid personally — $1.2k/yr** subscription + ~$49/mo MCP credit pack. Real V2 caps to port: **1,200 credits/month** (not 5,000), **150 credits/cycle**, **Mon+Thu 6am ET 2×/week** cadence (not every 8h), **7 saved searches/cycle** (3 opps + 2 awards + 2 forecasts) → ~115 credits/cycle → ~920 credits/month expected. 80% alert (960), 95% hard stop (1,140). Connector merged in #557 but **defaults need correction** — follow-up filed.
- **8 Principles + 6 Strategic Exclusions + 8% margin floor + evidence A/B/C** — enforced via #556 (pending merge)
- **OU canonical:** OU1=PD Systems (Tom Rogers), OU2=Riverstone (Derrick Elliot), OU3=Envision (Shawn, primary)
- **Leadership:** CEO AJ Johnson, CFO James McDermott, SVP BD Sunil Raphael

### Financial targets
- FY26: $70.1M revenue, ≥10% gross margin, 5.7% EBITDA, 1.8:1 book-to-bill
- FY28 target: $500M run-rate

### Infrastructure
- VPS: `187.77.206.105` (Hostinger)
- Frontend: `https://gda.csr-llc.tech`
- Backend V3: `https://gda-v3.csr-llc.tech` (port 4000)
- New: `gda-agent-v3` Python service (port 8001, on `gda` Docker network) — merged tonight via #560
- DB: `gda-postgres-staging` (port 5433)

### Standing rules (preserved verbatim)
- No symptom patches; root cause only
- No V2 fixes (V2 is dead)
- No `browser_task` for GitHub (gh CLI only)
- No PR merges to main without explicit Shawn "go" — **EXCEPT docs-only PRs** (rule clarified tonight)
- No production secret reads without confirm_action
- Always lead with a recommendation; never end open-ended
- Long work blocks, no narration between transitions

---

## Section E — Immediate Next Actions

1. **Wait for 5 rebase Devin sessions to complete** (#554, #556, #558, #559, #561, #562) — running in parallel now, ETA ~10-20 min each
2. **Code-review any post-rebase commits** to ensure conflict resolution didn't change logic
3. **Merge in recommended order:** #556 → #558 → #559 → #561 → #562 → #554 (gate each on Shawn "go")
4. **Watch main CI** after each merge to catch any cross-PR integration issues
5. **After all 6 land** → mark Track A (Cognition) and Track B (Plumbing) COMPLETE → unblock Section C downstream queue

---

## Section F — What's Left After Tonight

Once the 6 open PRs land, the V3 Cognition Layer + connector stack is **complete**. The remaining 11 spec-filed issues become unblocked:

- **3-4 weeks** to ship F-304 through F-313 sequentially (or in parallel doublets where deps allow)
- **F-314 V2 Decommission** is the final cutover — requires Shawn's explicit go, no auto-trigger

---

**Plan rev 3.0 — replaces rev 2.1 — Shawn approved underlying architecture; this rev only updates execution status.**
