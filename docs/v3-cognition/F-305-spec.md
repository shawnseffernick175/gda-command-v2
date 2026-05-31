# F-305: Opportunity Auto-Analysis on Open (R2 — full analysis, no clicks)

## Status
**Queued** — depends on F-300 (Agent Runtime), F-301 (RAG), F-302 (Decision Memory + PWin), F-303 (Doctrine Rules). Do NOT add `devin-ready` until those 4 are merged.

## Why this exists (verbatim from Shawn, codified as R2 in `docs/canonical/product_rules.md`)
> "Everything needs analysis and a searchable source. When i open an opportunity i need analysis completed"

R2 is canonical: **opening an opportunity triggers full agent analysis automatically.** No click-to-analyze button. No manual prompt. Open → analysis is already running or already cached.

## Objective

When a user lands on `/opportunities/:id`, the Agent Runtime executes the **Opportunity Analysis playbook** end-to-end and renders a complete decision-ready brief with sources cited per R1.

## The 10-section brief (canonical layout)

Every opportunity detail page must render these sections in this order:

1. **PWin score (F-302)** — numeric % + 3-bucket grade (Go / Reconsider / Pass) + top 3 contributing factors
2. **Doctrine alignment (F-303)** — pass/fail against 8 principles + 6 exclusions + 8% margin floor; one-line reason per violation if any
3. **Incumbent** — who holds it now, contract # + ceiling, end date, performance signals (CPARs from RAG F-301)
4. **Similar awards** — top 5 historical awards via vector similarity (F-301) with date, agency, value, awardee
5. **Competitors** — likely bidders ranked by similar-award win rate + cleared/uncleared status + ceiling fit
6. **Decision factors** — what the agency typically values (LPTA vs best-value, past performance weight, key personnel requirements)
7. **Teaming opportunities** — Riverstone (OU2) or PD Systems (OU1) read-only fit context where relevant
8. **Doctrine-aligned win themes** — 3-5 themes phrased in AJ's voice (from CEO-doc corpus chunks tagged "themes")
9. **Risks (first-class objects)** — top 5 risks, each linked to the canonical Risk record (see F-307 Risks-as-Objects)
10. **Citations footer** — every numeric and named fact in 1-9 must hyperlink to its source (R1)

## Hard rules

1. **R2 — auto-run on open.** Page first paint kicks the agent. Sections render progressively as they complete; placeholders show "Analyzing…" with skeleton. No "click to analyze" button.
2. **R1 — every fact cited.** No bare numbers, no "AI said so." All values link to the source (SAM notice, USAspending award, FR rule, CEO doc page, similar award URL).
3. **Cache-aware.** If analysis ran in last 24h AND no underlying source changed (sources_revision_hash stable), serve cache. If anything changed, mark cached sections stale + re-run.
4. **Doctrine block is non-overridable.** If F-303 returns a hard exclusion (e.g. margin <8%), the Go button is disabled at this surface. Manual override requires Shawn's explicit recorded justification in `decision_overrides` table — feeds F-302.

## Acceptance criteria

### Backend
- [ ] `GET /v3/opportunities/:id/analysis` — returns cached analysis or streams new run via SSE
- [ ] Playbook node graph in F-300: `fetch_opportunity → run_doctrine → fetch_incumbent → fetch_similar → fetch_competitors → score_pwin → generate_themes → assemble_risks → render_brief`
- [ ] Trace IDs returned to UI so user can click "show me how the agent got here" — F-300 trace UI

### Frontend
- [ ] `/opportunities/:id` triggers analysis on mount via SSE
- [ ] Each of the 10 sections is its own card, progressively rendered
- [ ] Stale badge on any section whose underlying source changed since last cached run
- [ ] "Show trace" link per section opens F-300 trace viewer scoped to that node

### Quality gates
- [ ] PWin score must be a calibrated number, not a vibe. F-302 calibration report from training set must show Brier score < 0.20 before this surface ships.
- [ ] Doctrine block has 100% rule coverage — every one of the 8 principles + 6 exclusions has a `pass | fail | n/a` for every opportunity (rule-by-rule, not aggregate).

## Risks
- Cold-start latency: first analysis on a never-seen opportunity could take 15-30s. SSE + section-by-section reveal mitigates perceived wait. Pre-warm: F-300 worker pre-analyzes new SAM notices within 5min of ingest.
- Hallucinated competitors: if F-301 has no similar awards for the agency+NAICS combo, return "insufficient data" not invented names.

## Definition of done
- Open any opportunity that has at least one SAM/USAspending source → all 10 sections render with cited values → doctrine block correctly enforces 8% margin and exclusion list → PWin number matches F-302 model output exactly → trace IDs work end-to-end.
