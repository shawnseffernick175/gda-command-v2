# GDA Command — Master Design Document (v1)

**Status:** Approved page-by-page with Shawn · **Date:** 2026-06-03
**Purpose:** Single build spec for the 100% new GDA Command tool. Replaces the live `packages/frontend-v3` app. Also seeds the in-tool User Guide.
**Author:** Computer (orchestrator) with Shawn (operator)

---

## 0. Overview & Honesty Model

GDA Command is an operator-grade GovCon intelligence and capture tool — not a consumer SaaS dashboard. Design references: **Linear** (visual language, keyboard, Cmd+K), **Palantir Foundry** (object-centric IA, rail + canvas + inspector), **Anduril Lattice** (operator briefing posture), **Shipley** (capture lifecycle/color gates), **GovSignals** (signal triage).

**The Honesty Gate (the core principle).** Every data point is either:
- **REAL** — computed/retrieved from real sources, shown with a clickable, searchable **source chip**; or
- **HEURISTIC** — honestly labeled (e.g., "keyword-based," "AI-suggested — verify"); or
- **PENDING** — hidden or marked "activates with the intelligence layer."

**There are NO "BS sentences."** Analysis is real + cited, or it honestly says it isn't ready. No templated filler, no fabricated incumbents/competitors/headlines, no cosmetic "healthy" lights.

**Real analysis depends on two backend builds:**
- **F-217 — LLM Router** (in flight): powers OODA, Ask AI, drafts, news digest, competitor/risk analysis. Anthropic (Haiku/Sonnet/Opus by task) + OpenAI; Perplexity Sonar at the `source_research` tier.
- **F-520 — Fast Track Discovery Engine** (to build): web-crawl academia/research → cluster → match → suggest.

---

## 1. The 12 Surfaces

| # | Tab | Route | Purpose |
|---|---|---|---|
| 1 | Launchpad | `/launchpad` | Daily operator briefing — "what needs me now" |
| 2 | Fast Track | `/fast-track` | Discover innovation (academia/research) → auto-suggest gov match → promote |
| 3 | Opportunities | `/opportunities` `/opp/:id` | Discover, filter, qualify, grade; OODA analysis + Ask AI on detail |
| 4 | Capture | `/capture` `/capture/:opp_id` | Capture plans, **owns pwin**, Shipley color reviews, RFP shredder, black hat |
| 5 | Pipeline | `/pipeline` | Operational board of active-stage pursuits; stage dropdown, days-in-stage, stalled flags |
| 6 | Awards & Intel | `/awards` | Won/lost history + AI-generated GovCon news digest + competitor wins |
| 7 | Financial Bible | `/financials` | Source of truth for financials; pwin-weighted waterfall; pipeline breakdown; feeds KPI header |
| 8 | Action Items | `/action-items` | Tasks, ownership, due dates, LLM-drafted responses |
| 9 | Settings | `/settings/:section` | Config sidecar + User Guide |
| 10 | Contacts | `/contacts` `/contacts/:id` | Auto-populating CRM/relationship graph |
| 11 | Competitors | `/competitors` `/competitors/:id` | Real competitor intel, ~10/day, your-space-first, sortable S/M/L |
| 12 | Risks | `/risks` | Enterprise risk register: pursuit + strategic; 5×5 cube; If/then; approve-gated |

**Left rail order:** Launchpad, Fast Track, Opportunities, Capture, Pipeline, Awards & Intel, Financial Bible, Action Items, Contacts, Competitors, Risks — spacer — Settings — Sentinel health chip (bottom).

---

## 2. Global Standards (apply to ALL surfaces)

### 2.1 Chrome
- **Top bar row 1:** "Envision" OU badge · Cmd+K search · **"+ Add"** menu (Opportunity / Risk / Action Item) · Approvals count badge · User menu.
- **KPI header (row 2, PERSISTENT on every tab):** **Orders · Sales · EBIT · Gross Margin · ROS**, each with value + delta vs plan (▲/▼ green/red) + sparkline. Dropdown/`?` explains each (definition, formula, period, source → Financial Bible). Computed from the Financial Bible. Single row, never wraps, monospace numerals.
- **Left rail:** persistent, never collapses to hamburger; active = 2px accent left bar; Sentinel health chip pinned bottom (real status, links to `/settings/health`).
- **Right inspector:** on object detail pages only; 320–560px, resizable, persisted.

### 2.2 Lists (every list/table)
- **Sortable** — clickable headers (asc/desc/none), multi-sort via Shift; state in URL (`?sort=`).
- **Searchable** — per-list search box (live filter) + global Cmd+K (cross-surface).
- **Filterable** — filter chips; state in URL. Search + filter + sort compose.
- **Collapse memory** — long lists/sections render **collapsed on first visit**; open-state + scroll position remembered as you navigate (sessionStorage); **reset to collapsed on browser close**.

### 2.3 Data & honesty
- **Source chips** — every data point has a clickable, **searchable** source chip (provenance). Real → real chip; heuristic/pending → honest label, no fake chip.
- **POCs → Contacts** — every POC encountered in any analysis/search auto-flows to Contacts (Tab 10).
- **Scores** — every score/grade/band/pwin has a **`?` tooltip** explaining meaning, scale, thresholds, drivers, and real-vs-heuristic note.

### 2.4 Formatting & visual
- **Consistency enforced** — single design-token source (D2 + `aesthetics_canonical_v1.md`); shared component library; pre-ship QA check. No component invents its own colors/fonts.
- **Money** = `$xxx.xB/M/K` (one decimal, abbreviated, single shared `formatMoney()`), everywhere.
- **Font floor = 11px** — nothing below; build fails if violated.
- **Dark theme default** (light opt-in). Palette: green positive, amber warning, red critical, cyan info, purple accent. IBM Plex Mono (data) + IBM Plex Sans (body). 8px spacing grid. 4px radius. Hairline borders, no zebra striping. Density: 36px rows, 18–22 rows/viewport.

### 2.5 Charts (hard quality gate — "never shit again")
- From the design system, one themed library, dark-native. **Restraint:** flat, clean, Linear/Foundry-grade. **NO** 3D, pie, gradient fills, drop shadows, chartjunk, rainbow palettes.
- **Purposeful only** — a chart must answer a question at a glance; else use a number/sparkline.
- Consistent styling per chart type; honest axes (no truncated baselines); sourced; weighted views labeled as estimates.
- **Visual QA pass before any chart ships.** If it looks like the old garbage, it doesn't ship.
- Per-surface chart spec in §4.

### 2.6 Surfaces are flat
- **No top sub-tabs.** Views = filter chips + sort + search + detail pages + inspector. Exceptions: Settings (left section nav), Financial Bible (stacked collapsible sections).

### 2.7 States (every surface handles 5)
Empty (instructional + CTA) · Loading (skeleton, **no spinner**) · Error (red-bar card + Retry) · Partial (render what loaded, scoped errors) · Success.

### 2.8 Keyboard
Cmd+K palette · J/K navigate · O open · P promote/advance · G-then-letter go-to · `?` help · Esc close.

---

## 3. Cross-Cutting Concepts

### 3.1 Stage model (canonical, tool-wide)
**Active:** Interest → Qualify → Pursue → Solicitation → Post-Submittal.
**Terminal:** Won · Lost · No Bid · Government Cancelled.
- **Global stage dropdown** wherever an opportunity appears — one-click change, optimistic UI, **logged** (who/when/from→to).
- "**Promotion" = a stage change.** Pipeline/Capture/Awards are stage-filtered lenses on ONE opportunity object.
- **Days-in-stage** tracked everywhere; **stalled** pursuits flagged (threshold in Settings) → Launchpad.
- Terminal follow-ups: Won → actuals to Financial Bible; Lost → loss reason to Competitors.

### 3.2 pwin vs. grade/band
- **Grade/band** = raw opportunity score (discovery signal) — set by scorer, shown on Opportunities. Bands: forecast ≥67, signal ≥45, discovery below.
- **pwin** = win probability — **set ONLY in Capture** via Shipley drivers (customer intimacy, solution fit, competitive position, price-to-win). Single definition tool-wide.
- **No capture plan → not forecastable**: pursuit shows value but "—" pwin and is excluded from the financial forecast until a capture plan exists.

### 3.3 OODA (only where invoked)
- **Display structure** on opportunity detail: Observe (facts + chips) → Orient (real analysis: doctrine, competitive landscape, risks) → Decide (pursue/watch/pass) → Act (buttons).
- **Escalating by stage** — a fresh OODA loop auto-runs at Qualify, Pursue, Solicitation, Post-Submittal (situation changes). **OODA history stack** (stage-stamped) + stage-to-stage **diff** ("what changed").
- **OODA tool** — Cmd+K "Run OODA on…" any target (agency/contract/recompete/company); real + cited; saves; POCs/competitors flow to their tabs.

### 3.4 Risk model
- **5×5 cube** (Likelihood 1–5 × Impact 1–5) heat-map. **"If… then…"** statement + **mitigation** underneath; mitigation → one-click **Action Item**.
- **Two classes:** pursuit risks (per opportunity/capture) + **strategic/external** (NDAA, market, war/geopolitics, CR/shutdown, policy).
- **AI-surfaced risks require approve/disapprove** (proposed state → Launchpad → confirm; dismiss can teach). AI risks cited; manual risks are yours.

### 3.5 Ask AI (object-scoped)
Slide-in toggle panel on opp/capture/competitor/signal/award/contact. Pre-loaded with the object's full context; real + cited; multi-turn; actionable (offers to draft/create/add). Never fabricates.

### 3.6 Black Hat
Adversarial analysis (how a competitor wins, our exposed weaknesses, ghosting, bid/no-bid implication). **Auto** on highest-scored opportunities (cutoff in Settings); **on-demand** elsewhere (Cmd+K + Ask AI). Slots into Pursue+ in the escalating OODA. Real + cited (canned-stub today → real with F-217).

---

## 4. Per-Surface Specs

> Each surface inherits ALL global standards (§2). Below = surface-specific purpose, layout, components, actions, data, states, honesty, charts.

### Tab 1 — Launchpad `/launchpad`
**Purpose:** Daily operator briefing — what needs you now. Approval queue lives here (no separate Approvals page). Everything ships honest (all real).
**Components (top→bottom):** 3 stat cards (Flags · Action items due today · Pipeline value) → **Top 5 Programs** (ranked by capture pwin; rank/program/agency/value/pwin/band/stage; click→`/opp/:id`) → **What Needs Me Today** (critical flags → pending approvals w/ inline Approve/Reject → overdue action items → **proposed risks** to approve) → **Recent Signals** (5 latest from Fast Track).
**Data:** `/kpi/header`, `/opportunities?sort=pwin_desc&limit=5`, `/launchpad/summary`, `/launchpad/flags`, `/action-items?due=today`, `/opportunities?status=signal&limit=5`.
**Charts:** restrained — at most one trend; mostly bold numbers (briefing, not dashboard).

### Tab 2 — Fast Track `/fast-track`
**Purpose:** Find ideas/innovations that need to be put on contract — from **academia & research** (phase 1; then DIU/AFWERX, SBIR, challenge.gov). For each: discover the innovation, **auto-suggest the gov match + your angle** ("in the mix": do the work or broker need↔solver).
**Signal card (3 layers):** ① The innovation (source: TTO/NSF/arXiv) ② Auto-suggested match (gov target + fit) ③ Your angle (prime / broker) + [Promote][Dismiss].
**Detail:** `/fast-track/signal/:id` (inspector: metadata, source link, promote).
**Backend:** **F-520 discovery engine** (crawl→cluster→score→suggest; plugs into F-217 source_research). Feeds `/opportunities?status=signal`.
**Honesty:** signal real (cited); match/angle "AI-suggested — verify"; Match strength "keyword — pending real scoring" until F-217.

### Tab 3 — Opportunities `/opportunities` + `/opp/:notice_id`
**Purpose:** Full feed — find, filter, qualify, grade (all 3,769 scored).
**List:** dense table — Title, Agency, Value, **Grade/Band** (not pwin), Due, Source chip, **stage dropdown**. Filter chips: band/agency/NAICS/set-aside/value/due. Default sort grade desc.
**Detail (Canvas + OODA inspector + Ask AI slide-in):** metadata header w/ stage dropdown, [Promote/advance][+Action]; description/scope/RFP docs; **POC cards → Contacts**. Inspector = **OODA** (Observe/Orient/Decide/Act); R2 auto-analysis on open (no spinner, streams in). Auto **Black Hat** if top-scored.
**Honesty:** REAL = grade/band, top drivers, doctrine (keyword-labeled), timeline, sources. PENDING (hidden/flagged, no fake chips) = incumbent, competitors → real with F-217.

### Tab 4 — Capture `/capture` + `/capture/:opp_id`
**Purpose:** Capture management; **owns pwin**; Shipley color reviews; RFP shredder; black hat.
**List:** Plan, Linked opp, Stage, **pwin**, Value, Next milestone; stage chips.
**Detail (Canvas + Inspector + Ask AI):** Canvas = capture plan (win strategy/themes/discriminators/price-to-win), **RFP Shredder** (RFP→Section L/M compliance matrix), POC cards. Inspector = **PWIN** (Shipley drivers roll up; manual override logged), **Color reviews** (Pink/Red/Gold/White gates), compliance checklist (% complete), teaming worksheet.
**Promote to Pipeline:** runs **Sentinel gate** (S-007/S-008: compliance complete, pwin evidence, named owner) → pass→`/pipeline`; fail→modal.
**Honesty:** pwin = real human judgment; AI-generated plan sections "AI draft — review."

### Tab 5 — Pipeline `/pipeline`
**Purpose:** Operational board of active-stage pursuits (Qualify→Post-Submittal). Money lives in Financial Bible; pwin lives in Capture.
**Components:** table — Pursuit, **stage dropdown**, **days-in-stage** (⚠ if stalled), next milestone, owner, pwin (read-only, "—" if none), value. Stalled sort to top, red. Filter chips incl. ⚠ Stalled.
**No separate detail** — row → linked `/opp/:id` or `/capture/:opp_id`.
**Charts:** stage funnel + aging.

### Tab 6 — Awards & Intel `/awards`
**Purpose:** Market radar — 3 collapsible sections.
1. **GovCon News (AI-generated)** — tool writes the digest from primary sources (SAM.gov RFIs/industry days, FPDS awards, EDGAR M&A, forecasts) → cluster → AI one-liners → source chip. Filter by type. Promote item → signal/opp. Powered by F-217 source_research. Pending → "activates with the intelligence layer" (no fake headlines).
2. **Our Awards (won/lost)** — terminal-stage pursuits; outcome/value/agency/date/**loss reason**. Won→Financial Bible; Lost→Competitors.
3. **Competitor Activity** — real FPDS awards by competitors → link to Competitors tab; auto-queues new competitors.
**Charts:** win/loss rate, awards by agency, competitor footprint.

### Tab 7 — Financial Bible `/financials`
**Purpose:** Financial source of truth; owns KPI header math. Sections (stacked, collapsible):
1. **Financial Summary** — 5 KPIs + period selector.
2. **Contract Waterfall** — stacked: Actual + Funded backlog + **capture-pwin-weighted pipeline**, Plan line overlaid. Signature chart.
3. **Pipeline Breakdown (financial)** — total vs weighted; by stage/agency/PoP year/pwin band; per-pursuit money table; reconciles with waterfall.
4. **Program-Level Table** — every contract/program; pwin from **Capture** (not pipeline); weighted, PoP, booked, actual.
5. **Plan vs Actual / Variance** — drives header deltas.
**Data load:** upload spreadsheet (P&L, plan, contracts) → parse → editable in-tool; pwin auto-pulled from captures. No terminal/copy-paste.
**Visible to everyone.** Honesty: actuals/plan real; forecast labeled "pwin-weighted estimate"; weighted = "—" with "no capture plan — not forecastable."
**Charts:** waterfall, stage/agency bars, KPI sparklines (all themed, QA-gated).

### Tab 8 — Action Items `/action-items` + `/:id`
**Purpose:** Tasks + LLM-drafted responses.
**Components:** table — Title, Due (overdue→top, red), Owner, Linked object, Status. Filter chips: Overdue/Today/This week/Done. **Draft with AI** for response items (RFI reply, CO question) — editable, **never auto-sends** ("AI draft — review"); optional "Draft & queue for one-click approval." Ask AI slide-in.
**Created from:** here, any object's +Action, Cmd+K, +Add menu, risk mitigation, stalled/stage follow-ups.

### Tab 9 — Settings `/settings/:section`
**Sidecar** (left section nav + content pane; `replaceState`; back→originating surface).
**Sections:** Sources · Partners · OU Tags · Sentinel Rules · **Agent Preferences** (black-hat score cutoff, stalled threshold, draft tone, auto-analysis aggressiveness, LLM model-per-task = F-217 routing table, competitor research/day, risk auto-surfacing) · Theme · **Health** (real Sentinel status, timestamps, one-click stale fix) · **User Guide**.
**User Guide:** in-tool, **printable (one-click Print/Export PDF, print stylesheet, page numbers)**, full **TOC** (jump links + page numbers, auto-generated), **also serves as the living boss-facing exec summary** (leads with a 1-page "What this tool is + the scoreboard + the 12 surfaces" overview, then the full reference), **explains everything** — honest about **limitations** and real-vs-pending. Chapters: Overview & Honesty Model · Global Concepts (stages, OODA, pwin, 5×5 risk cube, KPIs, formatting/keyboard) · the 12 Surfaces (purpose/what it does/how to use/components/actions/**limitations**/sources/dependencies) · **Tools** (Ask AI, OODA tool, Black Hat, RFP Shredder, competitor queue, discovery engine, news generator, +Add, Cmd+K, stage dropdown, source chips) · **Workflows** (Discover→Match→Promote; Qualify→Pursue→Win; Capture flow; Risk lifecycle; Win/Lost close-out; Daily operator loop; Financial forecast — numbered + diagrams) · Glossary. Searchable; `?` "About this tab" links from every surface; generated from this spec so it can't drift.

### Tab 10 — Contacts `/contacts` + `/:id`
**Purpose:** Auto-populating CRM/relationship graph. Captured from discovery (F-520), opp/award analysis, news; also manual.
**Fields:** Name · Role/title · Organization · **Source** (chip) · **First seen/contact date** · **Needs or capabilities** · Linked objects · Contact info · Type (Gov/Academia/Industry/Partner) · Last activity · Notes.
**List:** Name, Role, Org, Type, Source, First seen, Last activity; filter by type/org/source. Detail inspector + linked objects + Ask AI.
**Honesty:** every contact carries real source; auto-extracted fields "AI-extracted — verify"; no invented people/contact info.

### Tab 11 — Competitors `/competitors` + `/:id`
**Purpose:** Real competitor intel (CEO priority). Research queue ~10/day, **your-space-first** (NAICS/agency overlap ranks). Sortable by **size S/M/L**.
**List:** Name, Size, Overlap, Threat, Wins (FPDS), Last researched, Status (done/queued).
**Detail (Canvas + Inspector + Ask AI):** key facts (revenue/employees/certs/vehicles, sourced), POC cards→Contacts, head-to-head (shared agencies, collisions, win/loss); analysis = capabilities, contract footprint (FPDS), recent wins/recompetes, teaming behavior, strengths/weaknesses, threat to specific pursuits.
**Sources:** FPDS/USAspending + EDGAR + SAM.gov + Sonar (F-217). Auto-populated from opp OODA Orient, awards, news.
**Honesty:** NO hardcoded blurbs — researched (cited) or "queued — not yet researched." Size/threat/overlap trace to real data.
**Feeds:** opportunity OODA "Orient" (who else bids).

### Tab 12 — Risks `/risks` (+ per-pursuit register in OODA Orient)
**Purpose:** Enterprise risk register — pursuit + strategic. **5×5 cube**, If/then, approve-gated.
**Record:** description (**"If… then…"**), Category (Competitive/Compliance/Teaming/Schedule/Price/Technical [pursuit] · NDAA/Market/Geopolitical/CR-Shutdown/Policy [strategic]), **L×I → Score** (`?` explains), Status (Open/Mitigating/Closed), **Mitigation** (→Action Item), linked pursuit, Owner, Source chip, stage-stamped.
**List:** Risk, Pursuit (or "Strategic"), Category, L×I, Score, Status, Mitigation; filter by severity/category/status. Sort score desc, critical→top.
**Creation:** auto (each stage's OODA; black hat→competitive; RFP shred→compliance; intel pipeline→strategic) requiring **approve/disapprove**; or manual (+Add).
**Roll-ups:** Launchpad (critical/high + proposed-risk approvals); opp/capture OODA Orient.
**Charts:** the **5×5 cube heat-map** (the chart).

---

## 5. Backend Dependencies / Build Order

| Ticket | What | Status | Unlocks |
|---|---|---|---|
| **F-217** | LLM Router (Anthropic + OpenAI; Sonar at source_research) | In flight (devin-801d3cfa) | OODA, Ask AI, drafts, news digest, competitor + risk analysis, black hat |
| **F-520** | Fast Track Discovery Engine (academia/research crawl→cluster→match) | To build | Fast Track discovery + matchmaking; feeds Contacts |
| **F-460** | Fresh Next.js frontend base | Built (wrong repo, `gda-frontend`@e74411c); **retarget to replace `packages/frontend-v3`** via static export | The entire UI in this doc |

**Deploy mode (locked 2026-06-03): Static export + keep nginx.** The new Next.js app (App Router, Next 16) is configured `output: 'export'` → builds to static `out/`. The EXISTING multi-stage Dockerfile pattern is reused (node build stage → copy to `nginx:1.27-alpine` → port 80). UNCHANGED in prod: container name `gda-frontend-v3`, Traefik labels/cert (`gda.csr-llc.tech` || `app.csr-llc.tech` || `gda-v3-ui.csr-llc.tech`), `n8n_default` network, the `VITE_V3_API_URL`-equivalent build-time API URL contract (mapped to `NEXT_PUBLIC_API_URL`). SSR/Next API routes intentionally NOT used — authenticated SPA talking to the gda backend API. The frontend-v3 `eslint-rules` (font-floor ≥11px, design-token enforcement) and `design-tokens` carry over into the new codebase. Stack: Next 16 App Router, TanStack Query, shadcn/base-ui, Tailwind, lucide.
| New | KPI/financials endpoints + tables; contacts; competitors + research queue; risks; intel_news; stage/days-in-stage; RFP shredder | To build | Financial Bible, Contacts, Competitors, Risks, Awards news, stages |

**Honesty discipline for build:** any surface element ships REAL+cited, HEURISTIC+labeled, or PENDING+honest-placeholder. Charts pass visual QA. Fonts ≥11px. Money `$xxx.xB/M/K`. Design tokens enforced.

**Build strategy (locked 2026-06-03):** Scaffold **all 12 surfaces broad in parallel** — full nav present from day one. Every surface ships in one of its 5 honest states; the Honesty Gate makes PENDING surfaces read as disciplined ("activates with the intelligence layer"), never as broken or empty. No surface is hidden behind a phased rollout.

**Exec summary (locked 2026-06-03):** No separate static PDF. The boss-facing exec summary lives **inside Settings → User Guide** as a living, printable document (TOC + Print/Export PDF), kept current automatically because it is generated from this spec. Rationale: it will change frequently in the first month, and a static doc would drift.

---

## 6. Filed-Items Master Log (everything Shawn added)
1. Global KPI header (Orders/Sales/EBIT/GM/ROS) — permanent, every tab, with explainer dropdown.
2. Tab 7 Financial Bible — waterfall + pipeline breakdown + pwin-weighted forecast; upload-driven; visible to all.
3. pwin = Capture-plan only; no capture plan → not forecastable.
4. Pipeline financial breakdown lives in Financial Bible.
5. All lists sortable + searchable + filterable (URL state).
6. Collapse-on-first-visit; session-scoped open-state memory; reset on browser close.
7. Every data point has a clickable, searchable source chip.
8. News (OrangeSlices-style) → AI-generated from primary sources, on Awards & Intel.
9. Fast Track repurposed → discovery + matchmaking engine (F-520); academia-first; discover + auto-suggest match.
10. POCs in every analysis → auto-flow to Contacts (Tab 10, own tab).
11. Flat surfaces, no sub-tabs (except Settings/Financial Bible section navs).
12. OODA: display on opp detail + Cmd+K tool on any target; escalating per stage with history + diff.
13. "Real analysis, no BS sentences" — global quality bar.
14. Competitors (Tab 11) — real intel, ~10/day, your-space-first, S/M/L; feeds opp Orient.
15. Always give my recommendation with any choice.
16. Ask AI — object-scoped, slide-in, cited, actionable.
17. Auto Black Hat on highest-scored; on-demand elsewhere.
18. Opp→Pipeline direct allowed; forecast fills once capture pwin set.
19. Canonical stages + global stage dropdown + days-in-stage + stalled flag; "promotion = stage change."
20. Escalating analysis: fresh OODA at each stage.
21. Design consistency enforced; money `$xxx.xB/M/K`; font ≥11px; `?` score tooltips; KPI explainer.
22. Risks (Tab 12) — own tab + per-pursuit register; 5×5 cube; If/then + mitigation; approve/disapprove AI risks; pursuit + strategic (NDAA/market/war); +Add for opp/risk/action.
23. Settings User Guide — printable, TOC, explains everything incl. limitations, tools & workflows.
24. Charts where they make sense — professional, themed, restrained, QA-gated ("never shit again").
25. Build all 12 surfaces broad in parallel (no phased rollout); Honesty Gate carries pending surfaces.
26. Exec summary lives in Settings → User Guide (living, printable), not a separate static PDF — because it'll change a lot in month one.
