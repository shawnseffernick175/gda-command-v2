# GDA Command V3 — Completion Plan

**Owner:** Shawn Seffernick (CEO, Envision / SVP OU3, GDA)
**Author:** Computer (support role)
**Last updated:** May 31, 2026 (EST) — rev 2 (Shawn-directed corrections)
**Status:** APPROVED. Execution in progress.

### Rev 2 corrections (May 31, 2026 — 4:15 PM EDT)
1. **Gold removed.** Color Team Reviews ship with 6 colors only: Pink, Red, Black, Blue, White, **Green**. Green is the executive/final pass (doctrine alignment, exclusion check, 8% margin floor, signature-ready). Gold is intentionally NOT included.
2. **OrangeSlices is a format reference, not a data source.** Shawn uploaded the OrangeSlices Fresh Squeezed Daily News email as an example of what the morning brief should LOOK LIKE. The tool does NOT ingest OrangeSlices content. Daily News is built from our own sources (SAM, USAspending, Federal Register, GovWin, GovTribe, news, agency forecasts), styled in the OrangeSlices layout.
3. **GovWin + GovTribe credentials clarified.** GovWin = $1.2k/yr, company-paid, OAuth2 (`GOVWIN_CLIENT_ID` already in secrets, `GOVWIN_CLIENT_SECRET` needed at deploy). GovTribe = paid API, company-paid, schema already has `govtribe_cache` / `govtribe_credit_ledger` / `govtribe_credit_monthly`; needs `GOVTRIBE_API_KEY` at deploy. Both are first-class V3 connectors.

---

## Section 0 — North Star

**GDA Command V3 is an agentic analyst that ingests everything, learns from outcomes, surfaces what matters, and produces decisions and deliverables — for Envision (OU3) inside the Georgetown Defense Analytics enterprise, governed by AJ's doctrine.**

### Five non-negotiables

1. **Agentic, not static.** Every surface is driven by an AI that analyzes, decides, and explains. No "click to analyze" buttons. No empty scaffolds.
2. **It learns.** Every qualify / kill / win / loss / decision feeds back. PWin and recommendations improve over time.
3. **It ingests everything.** SAM, USAspending, Federal Register, GovWin (company-paid, $1.2k/yr), GovTribe (company-paid, paid API w/ credit ledger already in V3 schema), IMAP/email-in, drag-drop on every door, CEO docs, financials. It classifies and routes itself. OrangeSlices is NOT ingested — its Fresh Squeezed Daily News email is the *format/style example* for our morning brief, built from our own sources.
4. **It governs by doctrine.** AJ's 8 principles, 6 strategic exclusions, 8% margin floor, evidence A/B/C rubric — encoded as rules the tool enforces.
5. **It is premium and sourced.** Every data point clickable to source. Dark mode primary. ECharts only. Nothing on the tool older than 5 hours. No cartoon visualizations. No filler.

### Scope guardrails

- **Primary workspace:** Envision (OU3). Default view, default filter, default scope.
- **Partner data:** Riverstone (OU2) and PD Systems (OU1) live as **read-only teaming context** attached to Envision-led pursuits. No standalone partner opportunities, captures, pipeline, intel browsing, awards, or news.
- **GDA-consolidated views:** future state. Not in V3 completion scope.
- **Financials:** manual upload only (Shawn-controlled). PD-SYS 4-file monthly format. April 2026 close = Envision-OU only.
- **HR / candidate data:** excluded entirely.

### What V3 must replace before V2 is decommissioned

| V1/V2 workflow | V3 replacement |
|---|---|
| capture-plan | Color Team Reviews + Capture Plan generator |
| opp-tracker, opp-tracker 2 | Opportunities surface + auto-analysis |
| morning-briefing-v1 | Launchpad Daily News + What Needs Me Today |
| launchpad-funnel | Launchpad pipeline summary |
| dashboard-mega | Launchpad door summaries |
| deep-research | Agent tool: web + RAG research |
| pwin-calculator | Agent tool: PWin scoring with learning loop |
| opp-classifier (agentic) | Universal Ingestion classifier |
| intel-feed | Daily News + Regulatory Notices |
| recompete-early-warning | Day-1 banners + Sentinel risk flags |
| win-rate-weekly-digest | Decision Memory dashboard |
| idiq-task-order-alert | Awards surface + alerts |
| teaming-scorer | Agent tool: teaming partner recommender |
| learning-engine | Decision Memory + Learning Loop |
| win-loss-db | `agent_decisions` table |
| capture-milestone-alerts | Action Item Tracker |
| weekly-comp-scan | Competitive intel on opp open |

V2 is not decommissioned until every workflow above is functioning on V3.

---

## Section 1 — Cognition Layer (THE BRAIN — built first)

Nothing else on the agentic side works without this. Plumbing in Section 2 may proceed in parallel.

### F-300 — Agent Runtime

**Purpose:** Single sandboxed agent runtime backend feature that every agentic surface in the tool calls.

**Stack:** LangGraph (Python) + OpenAI (gpt-4o / gpt-5-class) + optional Anthropic fallback. Containerized service `gda-agent-v3` on the VPS, sibling to `gda-backend-v3`.

**Tool registry the agent can call:**
- `sam_search(query, filters)` → SAM.gov opportunities
- `usaspending_search(filters)` → award history, incumbent revenue, agency spend
- `federal_register_search(query, agencies)` → regulatory notices
- `govwin_search(query)` (after F-Govwin lands)
- `db_query(sql)` → safe read-only against `gda_command_staging`
- `rag_search(query, corpus_filter)` → F-301 vector store
- `web_search(query)` → Perplexity or Tavily API
- `doctrine_check(claim)` → F-Doctrine rules engine
- `decision_memory_lookup(filters)` → F-302 prior decisions/outcomes
- `file_read(doc_id)` → uploaded files
- `pwin_score(opp_id)` → calls the PWin model (F-302)

**Container-level AC:**
- `curl -s http://<agent-container-ip>:8001/healthz` returns 200 with `{ "tools": [...11 names...], "models_available": [...], "ready": true }`
- `POST /agent/run` with `{ "task": "Analyze SAM opportunity X", "tools_allowed": [...] }` returns a streamed plan + tool calls + final output
- Logs every tool call with input/output to `agent_trace` table
- Trace is visible in UI: every analysis is explainable, every step shows what tool was called and why

### F-301 — Knowledge Base + RAG

**Purpose:** The agent must be able to read your corpus before it answers anything.

**Stack:** `pgvector` extension on existing Postgres (`gda-postgres-staging`). New table `kb_chunks` (id, source_doc_id, ou_tag, doc_type, chunk_text, embedding vector(1536), grade_tag, created_at).

**Ingest at V3 completion (minimum corpus):**
- 7 CEO docs (Insight Into Future, Strategic Op Plan, Op Doctrine, Vision Transcript, Business Plan Slides, FY26-FY28 Business Plan PPTX + DOCX)
- Envision OU3 capabilities statement + 9-year IEW&S SETA past performance
- All 28 V1/V2 workflow specs from your zips (kept as architectural reference)
- Every PDF, DOCX, PPTX, XLSX you've uploaded since Feb
- Every CPAR / past performance record (when sourced)
- Doctrine principles (8) + Strategic Exclusions (6) as canonical chunks
- Vehicle portfolio (RS3, EAGLE, TACOM TS3 ERS, TSS-E, SeaPort-NxG, GSA PSS, OASIS+, Polaris, CIO-SP3, MDA SHIELD)
- Active contract portfolio (IEW&S SETA $54M, TRADOC/FORSCOM $25M+, PEO C3T $11M)
- Must-win pursuits (MAPS, 63rd BSB Recompete, IEW&S SETA Recompete RS3-25-0034, BAMBOOTIGER)

**Every retrieval returns chunks tagged with [A]/[B]/[C] evidence grade + source URL/doc.**

**Container-level AC:**
- `curl http://<agent-container-ip>:8001/rag/status` → `{ "chunks": <int>, "documents": <int>, "last_ingest": <ts>, "pgvector_version": "..." }`
- `POST /rag/search` with a query returns top-K chunks with source citations
- Re-ingest is idempotent; uploading the same doc twice does not duplicate chunks
- UI surface: "Knowledge Base" admin page showing every ingested doc, its OU tag, grade, source link, last refreshed timestamp

### F-302 — Decision Memory + Learning Loop

**Purpose:** The "learns" part. Without this, the agent is reset every time.

**Tables:**
- `agent_decisions` — id, kind (qualify, kill, win, loss, pass, team-decision, exclusion-trigger), entity_kind (opp, pursuit, partner, doc), entity_id, rationale_text, evidence_refs[], doctrine_alignment_score, made_by (Shawn / agent), made_at, outcome (null until resolved), outcome_recorded_at
- `pwin_features` — per-opp feature vector (vehicle, agency, NAICS, set-aside, incumbent flag, recompete flag, $value, days-to-RFP, capability-match-score, doctrine-alignment-score, OU coverage)
- `pwin_outcomes` — joins `pwin_features` to actual win/loss when resolved

**Learning loop:**
- Initial PWin model: rules-based (incumbency +30, capability match +20, exclusion violation = 0, doctrine misalignment -10, etc.)
- After ≥20 resolved outcomes: simple logistic regression retrained nightly on `pwin_outcomes`
- After ≥100 outcomes: gradient-boosted model (XGBoost)
- Every PWin score returned to UI includes feature weights ("scoring 72% — incumbency +28, capability match +22, doctrine +15, but pricing pressure -10")

**Container-level AC:**
- `curl /agent/memory/decisions?entity_kind=opp&since=...` returns prior decisions
- `curl /agent/pwin/score?opp_id=...` returns score + feature explanation
- Nightly cron retrains and logs new model version to `pwin_model_versions`
- UI: "Decision History" view per opportunity showing every qualify/kill/team decision with rationale and outcome

---

## Section 2 — Plumbing (pipes that feed the brain)

### F-Awards (in flight, GitHub #533)
USAspending Awards surface in V3 UI. 53 rows live. **AC adds:** every row clickable to USAspending.gov source URL; OU-tagged; feeds RAG corpus.

### F-Regulatory (in flight, GitHub #534)
Federal Register Regulatory Notices surface. 3 rows live. **AC adds:** every notice clickable to federalregister.gov source; classified by impact-on-Envision; feeds RAG corpus + Daily News.

### F-Ingest-Hardening
- SAM.gov cron healthy (✅ 258 rows live, keep)
- USAspending cron healthy (✅ 53 rows, keep)
- Federal Register cron healthy (✅ 3 rows, keep)
- SBIR.gov — currently 429 from VPS IP. **Decision:** route through proxy or kill if not deemed Envision-relevant by you. Recommendation: kill for V3, revisit post-cutover.
- DIBBS/NECO — .mil firewall blocks VPS. **Decision:** kill for V3.
- **GovWin** (company-paid, $1.2k/yr) — F-Govwin below.
- **GovTribe** (company-paid, paid API; `govtribe_credit_ledger`/`govtribe_credit_monthly` already in V3 schema) — F-Govtribe below.

### F-Govwin
Connector for GovWin IQ (your $1.2k/yr company-paid subscription).
- OAuth2: `GOVWIN_CLIENT_ID` (already in secrets) + `GOVWIN_CLIENT_SECRET` (Shawn pastes at deploy)
- Token-refresh loop; backend service account; no per-user OAuth
- Ingests opportunities, recompete forecasts, competitor history, incumbent data
- Feeds RAG corpus + Opportunities + Decision Memory
- **AC:** GovWin opps merge with SAM opps with dedup logic (UEI + title + agency); every GovWin row clickable back to GovWin; auth-expired errors surface to Sentinel with plain-language fix steps.

### F-Govtribe
Connector for GovTribe (company-paid, paid API). Schema already has `govtribe_cache`, `govtribe_credit_ledger`, `govtribe_credit_monthly` — V3 backend wires these properly.
- API key in env (`GOVTRIBE_API_KEY`)
- Credit-aware: every call decrements `govtribe_credit_monthly`; Sentinel warns at 80% budget burn
- Ingests opps, agency intel, contact data, recompete signals
- Feeds RAG corpus + Opportunities + Decision Memory
- **AC:** GovTribe opps merge with SAM + GovWin (dedup by title + agency + due date); credit ledger visible on Sentinel; every GovTribe-sourced row clickable back to GovTribe.

### F-Auth + Deploy hardening
- Login working at `gda.csr-llc.tech` ✅
- **AC adds:** session length ≥ 8h, audit log of every login, password reset flow, MFA-ready (TOTP) — Shawn can defer MFA but the table/flow must exist.
- Traefik routing audit — confirm no V2 routes remain after cutover (Section 7).

---

## Section 3 — Agentic Surfaces (built on Cognition Layer)

### F-Launchpad (homepage, 1-screen)
- **Daily News** block (top) — morning brief built from **our own sources** (SAM, USAspending, Federal Register, GovWin, GovTribe, news connectors, agency forecasts). Visual layout mimics the OrangeSlices Fresh Squeezed Daily News email Shawn uploaded as a *format example*. Top 5 items, AI summary, OU3-relevance score, source links. OrangeSlices content itself is NOT ingested.
- **What Needs Me Today** — agent surfaces top 5 (deadlines, stalled items, fresh risks, sync failures) with AI badge; manual to-do items below; clear visual separation
- **Day-1 banners** — CIO-SP3 expired 4/29/2026, CMMI expiring 8/7/2026, IEW&S SETA RS3-25-0034 proposal due 02 APR 26 (or already submitted — confirm and update banner); MAPS / FORCE / 63rd BSB urgent
- **Door summaries** — Opportunities, Pipeline, Capture, Performance, Past Performance, Vehicles/IDIQs, Company Profile, Financial Bible, Sentinel — each a tile with count + agent one-liner ("3 opps need qualification; 1 violates exclusion #4")
- **AC:** every tile clickable to its door; agent summary refreshes every 1h; nothing displayed >5h old without staleness warning

### F-Opp-Auto-Analysis (the headline feature)
**Trigger:** opening an opportunity. No button. Agent runs synchronously up to 10s, returns 503 ANALYSIS_TIMEOUT if exceeded (per your R2 rule). Cached for 1h.

**Output (10 sections, all sourced):**
1. **PWin + reasoning** (from F-302 model; feature weights shown)
2. **Grade** (A-F) with rubric
3. **Incumbent ID** (from USAspending + GovWin + GovTribe)
4. **Similar past awards** (USAspending + RAG over your CPARs)
5. **Competitive landscape** (named competitors, not "Large Prime"; from GovWin + GovTribe + USAspending + RAG)
6. **Decision factors** (capability match, vehicle access, clearance fit, pricing risk)
7. **Recommended teaming partners** (Envision-led; OU1/OU2 read-only context if relevant)
8. **Doctrine alignment** (all 8 principles checked; exclusion check; 8% margin check)
9. **Risks** (execution, staffing, margin, compliance, customer concentration — same R1-R5 framework as your business plan)
10. **Citations** (every claim has a clickable source link; evidence grade [A]/[B]/[C] tagged)

**AC:** opening an opp on V3 returns the 10-section analysis within 10s on cache hit, runs synchronously on miss; every claim has a clickable source; doctrine violations are flagged red; exclusion triggers block "qualify" button with override + rationale required.

### F-Capability-Matching + Auto-Qualify
- Agent maps each incoming opp's NAICS / scope / clearance against Envision's 5 core offerings (SETA Engineering for IEW&S/C5ISR, C5ISR Systems Integration & Test, R&D Engineering, XR Training Integration, Tactical Infrastructure Support)
- Score 0-100; auto-suggest qualify/kill but **only Shawn qualifies** (your rule)
- Feeds the "Recommended teaming partners" section above

### F-Sentinel
Plain-language health monitor.
- "All syncs healthy. Last SAM pull 14 min ago. Federal Register 3 new notices today. USAspending lag 6 hours (within tolerance). GovTribe at 64% of monthly credit budget — pacing on track. One issue: GovWin auth expired 4 hours ago — fix needed."
- Top of Launchpad as a status pill; full page on click
- **AC:** every sync source has last-run + health state; failures escalate to Action Item Tracker; no engineer jargon

### F-Risks-First-Class
- Risk objects across Opp, Capture, Proposal, Performance
- Heat map per opp (likelihood × impact, 5×5, same as your business plan)
- Roll-up to Launchpad ("3 high-impact risks across pipeline")
- Source-linked (each risk traces to the doc / data point that created it)

### F-Universal-Ingestion
- Drag-drop available on every door (Opportunities, Capture, Performance, Past Performance, Vehicles, Company Profile, Financial Bible, Action Items)
- Email-in inbox (e.g., `intake@gda-command.csr-llc.tech`) — IMAP or webhook
- Agent receives doc/email → classifies (RFP, draft proposal, CPAR, capture plan, financial close, partner intel, action item, news) → routes to correct door → extracts metadata → notifies Shawn
- Unpacks `.msg`, `.eml`, `.zip`, extracts attachments, classifies each
- Direct subscriptions for known sources (GovWin alerts, GovTribe alerts, agency forecasts) — email-in is fallback for arbitrary attachments only

### F-Action-Item-Tracker
- Reads email/doc → identifies required action → extracts due date → classifies (reply, research, meeting, task) → drafts the action:
  - Email reply draft (review before send)
  - AI research prompt (run on demand)
  - Calendar event (gcal connector)
  - Task with milestones
- Surfaces in Launchpad "What Needs Me Today"
- **AC:** every action has a source (email/doc link); drafts are clearly marked "AI draft - review"; no auto-send

### F-Daily-News
- Morning brief built from **our own data sources** — SAM (new solicitations since last check), USAspending (new awards in OU3 lanes), Federal Register (rules/notices), GovWin (recompete signals, forecasts), GovTribe (opp updates, contact moves), news connectors per agency/competitor watchlist.
- Visual layout mirrors the OrangeSlices Fresh Squeezed Daily News email Shawn uploaded as the *format reference* (left rail: section headers; main column: ranked items with one-line agent summary + source link + OU3-relevance score; right rail: action chips).
- OrangeSlices content itself is NOT ingested — only the layout is the inspiration.
- Agent: pull → dedupe → classify → score OU3-relevance → summarize → display top 5 per section on Launchpad
- Full archive searchable; every item links to origin
- **AC:** Daily News block visually matches the OrangeSlices reference layout (header bands, section grouping, item density); zero OrangeSlices content present; every item sourced; refreshes every 1h.

---

## Section 4 — Output Generators

### F-Color-Team-Reviews (on any uploaded doc)

Single capability. Doc upload → "Run Color Team" → select colors (or "Run All").

| Color | What it does |
|---|---|
| **Pink** | Storyboard/outline review — compliance matrix against RFP, win theme placement, ghost competitors |
| **Red** | Draft proposal review — score each section as government evaluator would, identify weak claims, scoring risk |
| **Black** | Adversarial competitor simulation — what each named competitor will bid, price, themes, attack angles |
| **Blue** | Customer perspective — read as CO/COR; pain points addressed; risk tolerance matched; past performance relevance |
| **White** | Compliance-only sweep — Section L/M crosswalk, FAR clauses, page/font/format limits |
| **Green** | Pricing review — labor mix, margin vs. competitor history, USAspending pricing data, FFP risk, 8% margin floor check, exclusion check, doctrine alignment, signature-ready (Green absorbs what would have been Gold) |

**Inputs:** uploaded doc + RAG corpus (your doctrine, OU3 capabilities, CPARs, competitor history, USAspending pricing)
**Output:** structured findings per color (severity, citation, recommended fix, doctrine score)
**Diff mode:** re-running on a revised draft shows diff against prior review
**Actions:** every finding can be one-click sent to Action Item Tracker

**AC:** running all 6 colors (Pink, Red, Black, Blue, White, Green) on a 30-page RFP draft completes within 5 min; output is a PDF + UI view; version history preserved; every claim sourced. Gold is intentionally NOT included — Green is the executive/final pass.

### F-Briefing-Generator
Customer/program briefing PDFs (status, performance, recompete strategy) — agent-drafted from active contract + CPAR data, Shawn edits, exports as PDF/DOCX with GDA brand.

### F-Capture-Plan-Generator
Full capture plan PDF per pursuit — pulls opp data, competitor analysis, teaming, win themes, pricing strategy, milestones from the underlying data + agent reasoning.

### F-Win-Theme-Generator
Win themes + discriminators + ghosts per pursuit — agent drafts from RAG (your capabilities, competitor weaknesses, customer pain) for Shawn to refine.

---

## Section 5 — Doctrine Enforcement Layer

Encoded as rules the tool enforces — not displayed as wallpaper.

### The 8 Principles (from AJ Op Doctrine)
1. **Alignment** — One Direction. One Mission.
2. **Ethics Always** — Integrity is Non-Negotiable.
3. **Teamwork** — Team First, Mission Always.
4. **Data First, Then Debate** — Facts Before Opinions.
5. **Relentless Execution** — Finish What We Start.
6. **Relationships, Relationships, Relationships** — Trust Compounds.
7. **Market, Mission, Brand Focus** — Compete Where It Matters.
8. **Customer Facing** — Stay Close to the Mission.

Every opp analysis returns a doctrine alignment scorecard (8 rows, score 1-5 + rationale + source).

### The 6 Strategic Exclusions (hard rules)
1. No low-assurance non-classified cyber services
2. No commercial-only software development
3. No staff-augmentation-only pursuits
4. No pursuit <8% gross margin in core lanes (executive override required)
5. No non-cleared / purely commercial IT
6. OU2 only: no mission lanes outside NSA, NGA, NRO, ODNI, CIA, USCYBERCOM

Triggering any exclusion = qualify button disabled until Shawn overrides with written rationale (logged in `agent_decisions`).

### Evidence Rubric (encoded)
Every fact in the tool tagged [A] primary, [B] secondary, [C] hypothesis. Agent refuses to use [C] for must-win decisions. UI shows the tag inline next to every claim.

### Margin floor
8% gross margin in core lanes is enforced at the Capability Matching layer and at the Color Team **Green** review (Green is the executive/final pass; Gold is removed).

---

## Section 6 — Governance & Scope

- **Envision-only default view** on every surface
- **Partner profiles** (Riverstone, PD Systems) read-only; only appear as teaming context attached to an Envision-led pursuit
- **No standalone partner surfaces** (no Riverstone opps tab, no PDS news, no PDS pipeline)
- **Financial Bible** manual upload only; PD-SYS 4-file format (Trended Balance Sheet, Trended Income Statement, Trend SIE, YTD GL Detail); current April 2026 close = Envision-OU only
- **HR / candidate data excluded** entirely

---

## Section 7 — Cutover + V2 Decommission

Cutover gate: **every workflow in the Section 0 table above must be functional on V3**, validated by Shawn.

Cutover steps:
1. Final RAG corpus refresh
2. Final Decision Memory backfill from any V1/V2 win/loss data still extractable
3. Sentinel green across all sources
4. Shawn-driven dogfood week (Shawn uses V3 for actual qualification + capture decisions)
5. DNS / Traefik routes flipped — V2 routes return 410 Gone
6. V2 containers stopped, snapshots archived to S3 / cold storage
7. V2 database snapshot archived; V2 schema dropped 30 days after cutover (your buffer)
8. **All non-V3 versions deleted from the repo and the VPS** (your standing instruction)

---

## Section 8 — Sequencing (no time limits, just order)

**Track A — Cognition (must complete before Track C agentic features go live):**
A1. F-301 RAG (pgvector + corpus ingest of 7 CEO docs + business plan + V1 workflow specs)
A2. F-300 Agent Runtime (LangGraph + tool registry + healthz + trace)
A3. F-302 Decision Memory tables + initial rules-based PWin scorer

**Track B — Plumbing (parallel with A; some already in flight):**
B1. F-Awards (USAspending) ← in flight #533
B2. F-Regulatory (Federal Register) ← in flight #534
B3. F-Ingest-Hardening (kill SBIR + DIBBS, keep SAM/USA/FR)
B4. F-Govwin connector
B4a. F-Govtribe connector
B5. F-Auth + Deploy hardening (session, audit, MFA-ready)
B6. F-Doctrine rules engine (used by A2 + Color Team + Opp Analysis)

**Track C — Agentic Surfaces (gated by A1-A3 complete):**
C1. F-Opp-Auto-Analysis
C2. F-Capability-Matching
C3. F-Sentinel
C4. F-Risks-First-Class
C5. F-Universal-Ingestion
C6. F-Action-Item-Tracker
C7. F-Daily-News (own-source-built; OrangeSlices = layout reference only)
C8. F-Launchpad (consumes all of C1-C7)

**Track D — Output Generators (gated by C complete):**
D1. F-Color-Team-Reviews (Pink, Red, Black, Blue, White, Green — no Gold)
D2. F-Briefing-Generator
D3. F-Capture-Plan-Generator
D4. F-Win-Theme-Generator

**Track E — Cutover:**
E1. Dogfood week
E2. V2 decommission
E3. Delete all non-V3 versions

---

## Section 9 — Standing Build Rules (apply to every F-spec above)

- **Container-level verification AC** on every spec (curl from inside the network, not just UI screenshots)
- **Root cause only** — no symptom patches, no SQL aliases, no V2 fixes
- **Source link on every data point** clickable to origin
- **Dark mode primary**, light mode opt-in
- **ECharts only** when charts are used; no cartoon visualizations; charts only when they answer a specific decision
- **Nothing on V3 >5h old** without staleness warning
- **5h idle = escalate or restart** (Devin / PR / issue / branch)
- **Full scope, no degradation, no MVP-cut**
- **Premium UI** — clean hierarchy, restrained color, professional typography, logical density, aesthetics and organization
- **Devin work via `gh` CLI** only; no `browser_task` for GitHub
- **No filing devin-ready issues without `confirm_action`**
- **PRs not approved without Shawn's explicit "go"**

---

## What I need from you to start executing

1. **Sign-off on this plan as written** ("approved" / "modify X" / specific changes)
2. **Confirm OU naming** — Op Doctrine doc says BU1 Defense & Mission Systems = PD Systems, BU2 Intel & Cyber = Riverstone, BU3 Training & Sim = Envision. I had this inverted in older memory. Confirm this is correct so I don't re-invert it.
3. **GovWin credentials** — already confirmed: $1.2k/yr, company-paid. `GOVWIN_CLIENT_ID` is in secrets; need `GOVWIN_CLIENT_SECRET` pasted at deploy.
4. **GovTribe** — confirmed paid API, company-paid; schema already has credit ledger. Need `GOVTRIBE_API_KEY` pasted at deploy.
5. **OrangeSlices** — confirmed: layout/format reference only. We do not ingest OrangeSlices content.

Once signed off: Track A (Cognition) starts immediately, Track B continues, Devin gets new issues filed for A1/A2/A3.

— end of plan —
