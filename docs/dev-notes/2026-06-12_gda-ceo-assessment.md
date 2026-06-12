# GDA Command — CEO-Grade Readiness Assessment

**Date:** 12 Jun 2026
**Author:** Shawn (with AI assist)
**Audience:** Internal — preparation for page-by-page review tomorrow
**Standard applied:** Every screen must be a defensible SITREP — sourced, current, no placeholders, no guesses, no decoration.

---

## Executive Summary

GDA Command has 19 navigable pages. Of those:

- **3 are CEO-ready today** (data is real, sourced, current).
- **6 are partially ready** (real data flows but presentation, labels, or sourcing are not yet exec-grade).
- **8 are not ready** (page exists but underlying table is empty, parsers haven't ingested the docs, or the system feature isn't wired in).
- **2 are admin/internal only** (Settings, Prompt Creator — not part of the SITREP surface).

The single biggest CEO-readiness blocker is **Financial Bible**. It's the page most likely to be opened first and the one with the largest current gap: only 50% of the Q1 vault docs have been parsed, the plan/target side of the dataset has only 2 rows (March + Q1, both seeded to the same number), and the balance sheet table is empty. Devin issue **#815** is in flight to fix this.

The second biggest gap is **silent emptiness** across 7 pages (Capture, Risks, Approvals, Competitors-by-name, Partners, Compliance, Action-Items-by-status). Each renders without telling the user *why* it's empty — was nothing ingested, is the feature off, or is the table not yet populated? A CEO opening these screens won't be able to tell "no data yet" from "tool is broken."

The third is **placeholder labels and unsourced numbers** scattered across otherwise-working pages — Launchpad, Daily Brief, Pipeline, Opportunities. Numbers render but aren't tagged with their source doc, ingestion timestamp, or refresh status.

Everything else is recoverable in 1–2 PRs each, sequenced.

---

## How the data flows (one-paragraph mental model)

Upstream feeds — SAM.gov, GovTribe, GovWin, USAspending, SEC EDGAR, Crunchbase, NIH — write to source-of-truth tables (`opportunities`, `awards`, `regulatory_notices`, `govtribe_contacts`). Vault documents the user uploads (`vault_documents`) get parsed by LLM workers into structured tables (`financial_actuals`, `financial_plan`, `balance_sheet_actuals`, eventually `cost_detail_actuals`, `indirect_expense_actuals`). Operator overrides (`opportunity_decision_overrides`, `pipeline_items.stage`) sit on top. Pages are thin React reads of one or two of those tables via REST endpoints. The frontend has no business logic — if a page is empty, the table behind it is empty, or the endpoint is filtering it out.

---

## Live row counts (as of 12 Jun 2026 21:44 UTC)

| Table | Rows | Notes |
|---|---|---|
| opportunities | 17,809 | 226 marked `relevant`, 14,274 `off_profile`, 2,601 `unknown_naics`, 708 `auto_pass` |
| pipeline_items | 5,538 | **100% in `no_bid` stage** — no `pursue`, `bid`, `capture`, `submitted` |
| awards | 64,966 | feeds Competitors page |
| opportunity_analysis_cache | 18,149 | LLM-generated rationale for ~every opp |
| action_items | 46,012 | **100% `open`** — no completed/closed status anywhere |
| govtribe_contacts | 5,036 | feeds Contacts page |
| vault_documents | 30 active (103 lifetime) | of 30 active: 23 `other`, 3 `financial`, 2 proposal, 2 market research |
| regulatory_notices | 299 | drives compliance signals |
| fast_track_signals | 17 | populated; matches=1, assessments=0 |
| financial_actuals | 6 | Jan/Feb/Mar/Q1 FY26 from income statement; Mar+Q1 L1-actual (duplicate, lower number → parser bug) |
| financial_plan | 2 | **Only Mar + Q1; both seeded to identical $4.09M** — plan side is broken |
| balance_sheet_actuals | 0 | not parsed yet — #815 |
| captures | 0 | never written |
| risks | 1 | 1 open |
| compliance_items | 0 | never written |
| partners | 0 | no table — page would 404 if linked |
| competitors (table) | does not exist | page derives from awards (live) |
| contract_vehicles | 11 | small list, real |
| users | 1 | shawn |

---

## Page-by-page assessment

Each page is rated:
- **GREEN** — CEO-ready: data is real, sourced, current, labeled.
- **AMBER** — Data flows but needs polish (labels, source citations, status strip, empty-state language).
- **RED** — Underlying table empty, parser not done, or feature not wired.

### 1. Launchpad — `/launchpad` — **AMBER**

**Reads:** `unified_opportunities`, `daily_briefing_cache` (2 rows), `fast_track_signals` (17 rows). Hits hooks `useLaunchpadSummary`, `useTopPrograms`.

**Current state:** Renders. Daily brief cache and FT signals are real.

**CEO gaps:**
- No "Last refresh" / "Data as of" stamp visible to user.
- "Top Programs" table — what's the source? Awards? Opportunities? Needs visible attribution.
- Numbers shown without unit context (count vs dollars).
- Briefing card may show an old `briefing_date` silently — needs explicit date and "stale" flag if > 24h old.

**Fix size:** Small (1 PR, header status strip + source labels on each card).

---

### 2. Daily Brief — `/briefing` — **AMBER**

**Reads:** Hook `useTodayBriefing` → `/v3/briefing/today` → `daily_briefing_cache`. Has `briefing/export` for download.

**Current state:** Renders today's brief from cache (2 rows total in table — yesterday + today most likely).

**CEO gaps:**
- The brief text itself is LLM-generated — needs explicit "Generated by GPT-X at HH:MM ET from N sources" footer.
- No list of which underlying notices/awards/opps drove the narrative — the SITREP standard demands citations.
- No "regenerate now" control visible.
- If cache is stale (job didn't run), the page silently shows yesterday. Needs banner: "Showing 11 Jun brief — today's regenerated daily at 06:00 ET."

**Fix size:** Small-medium.

---

### 3. Digest — `/digest` — **AMBER**

**Reads:** Hook `useDigest` → `digest_cache` (1 row).

**Current state:** Has one cached digest. Page renders.

**CEO gaps:**
- Same pattern as Daily Brief — no source-doc citations, no refresh timestamp, no regenerate.
- Unclear what window the digest covers (24h? 7d?). Must show explicitly.

**Fix size:** Small.

---

### 4. Fast Track — `/fast-track` — **AMBER (close to GREEN)**

**Reads:** `fast_track_signals` (17), `fast_track_matches` (1), `fast_track_assessments` (0). Generates analysis via `useFTMatchAnalysis` (LLM, on demand).

**Current state:** Tables render, signal-strength bars show, matches section visible. This is one of the most coherent pages.

**CEO gaps:**
- `fast_track_assessments` = 0 → "Recent Assessments" section is empty. Needs explicit message: "No assessments run yet — assessments are generated when you accept a match."
- No source attribution on each signal (where did it come from — RSS, SBIR, SAM, news?).
- 1 match is below the threshold a CEO would expect to see anything actionable.

**Fix size:** Small (empty-state copy + source badges).

---

### 5. Opportunities — `/opportunities` — **AMBER**

**Reads:** `opportunities` (17,809) + vehicles via `useVehicles`. Heavy filtering, eligibility chips, tooltip rationale.

**Current state:** This is the workhorse page and works. 226 marked relevant out of 17,809 — that's the actionable list.

**CEO gaps:**
- Default view drops the user into the 17K firehose. CEO needs an exec default: "226 relevant, 4 within bid window, X awaiting decision."
- "Eligibility rationale" tooltips exist but come from LLM cache — needs visible "AI-analyzed N hours ago" tag.
- The 30-day auto-no-bid rule is enforced silently — needs a visible chip on rows it touched: "Auto-no-bid: <30 days to response."
- Decision provenance: opportunities flipped manually vs by rule should be visually distinguished.

**Fix size:** Medium (1 PR for exec summary header, 1 PR for badges & provenance).

---

### 6. Vehicles — `/vehicles` — **GREEN**

**Reads:** `useVehicles` → `contract_vehicles` (11 rows).

**Current state:** Small, real list. 99-line page, simple table.

**CEO gaps:**
- Minor: should show "Last verified" per vehicle since these change quarterly.
- Ceiling-remaining values — if shown — need source (SAM ASBL? GSA Schedule sales?).

**Fix size:** Trivial.

---

### 7. Capture — `/capture` — **RED**

**Reads:** `captures` (0), reads from `pipeline_items` (filters `stage = 'Pursue'` — there are 0 in that stage). Mutation `/v3/captures/:id/generate-plan`.

**Current state:** Page renders but is functionally empty. No items in `pipeline_items` are in `Pursue` stage (all 5,538 are `no_bid`).

**CEO gaps:**
- Whole page is dead. CEO opens it, sees nothing, learns nothing.
- This is a feature that depends on **the user having moved opportunities into Pursue** — but the rule "only Shawn can move to pipeline" means the front door is being followed. The page just hasn't been used yet.
- Needs empty-state copy: "0 opportunities in Pursue stage. Move opportunities from Opportunities → Pursue to generate a capture plan."

**Fix size:** Trivial empty state. Real fix is moving items into Pursue — a workflow problem, not a tool problem.

---

### 8. Pipeline — `/pipeline` — **AMBER**

**Reads:** `usePipelineSummary` → `/v3/pipeline/summary`, plus paged list.

**Current state:** Returns 5,538 items, **100% in `no_bid`**. The page renders but is functionally a "rejection log" right now.

**CEO gaps:**
- All-`no_bid` reality is invisible — the page must surface this distribution (donut or strip across stages) so the CEO can see "we're not actually pursuing anything yet."
- "no_bid" reason isn't shown per row (system rule vs manual vs 30-day). Needs a `decision_source` column visible.
- Total pipeline value / weighted value / TCV figures need to be tagged: "Excludes no-bid (5,538). Active pipeline: $0 across 0 items."
- Risk is the CEO sees a 5,538-row pipeline and assumes pursuit volume.

**Fix size:** Medium (1 PR — strategic dashboard view above the list, decision-source column, weighted value).

---

### 9. Awards & Intel — `/awards` — **AMBER (close to GREEN)**

**Reads:** `useAwardsPaged` → awards table (64,966 rows).

**Current state:** Solid. Real awards data, searchable, filterable.

**CEO gaps:**
- Sourcing: USAspending? FPDS? GovTribe? Needs a single "Source: USAspending.gov · Refreshed daily 03:00 ET" line.
- No exec rollup — "Awards in our NAICS in last 30 days: N · $Y." That's the SITREP cut.
- Incumbent column is partially backfilled (we saw 11/218 filled from #810). Empty cells need a soft "—" not blank.

**Fix size:** Small.

---

### 10. Approvals — `/approvals` — **RED**

**Reads:** `useMatchSuggestions({ limit: 100 })`.

**Current state:** Depends on something generating match suggestions. Worker may not be active.

**CEO gaps:**
- Unknown if the suggestion queue is running. Page likely empty.
- Needs explicit: "No suggestions awaiting review" vs "Match-suggestion worker has not run in N hours."
- If this is intended for CEO sign-off on opportunity decisions, the workflow is unclear from the screen.

**Fix size:** Investigate first (is the worker even on?), then small UI fix.

---

### 11. Financial Bible — `/financials` — **RED** ← biggest gap

**Reads:** `useKpiHeader` → `/v3/financials/kpi-header` (reads `financial_actuals` JOIN `financial_plan`). Also pipeline forecast, historical trend, balance sheet.

**Current state, ground truth:**
- `financial_actuals`: 6 rows — Jan/Feb/Mar/Q1 FY26 from income statement parser; Mar + Q1 also written by L1-actual parser **with a wrong number** ($4.18M vs the income-statement-derived $9.86M for Q1 — Q1 should equal Q1, not equal March).
- `financial_plan`: 2 rows — only March and Q1, **both seeded to $4,088,616.56 plan_sales** (Q1 plan equal to March plan is wrong — Q1 should be the sum across Jan+Feb+Mar plan, ≈ $11–12M).
- `balance_sheet_actuals`: 0 rows.
- `cost_detail_actuals`: table doesn't exist yet (reserved v3_077).
- `indirect_expense_actuals`: table doesn't exist yet (reserved v3_078).
- 14 vault docs ingested for Q1; **10 of 14 returned `not_financial`** from the classifier (SIE, TGT-vs-ACT, Balance Sheet are real financial docs but not KPI-shaped).

**CEO gaps:**
- KPI hero card today shows Q1 actual vs Q1 plan where plan == March's plan number. Variance figure is misleading. **This is the worst kind of bad data — it looks credible but is wrong.**
- Balance sheet table is empty.
- TGT-vs-ACT, SIE, expense detail — none parsed.
- No "docs ingested: X / Y" indicator.
- No "showing FY26 Q1 — fiscal year started Jan 2026 (acquisition)" context.

**Fix size:** Large — already in flight as Devin issue **#815** (parsers v2). Adds:
- Balance Sheet parser → populates `balance_sheet_actuals`.
- `cost_detail_actuals` parser → migration v3_077.
- `indirect_expense_actuals` parser → migration v3_078.
- 4 new endpoints + 3 new components.
- Source-citation footer on every panel.
- Status strip ("As of MAR-26 · 14 docs ingested · last refresh HH:MM").
- Print-friendly 1280×800.

**Additional gap not yet in #815:** The L1-target plan numbers need a row per month (not just Mar and Q1). And the L1-actual parser is reading the wrong cell (Q1 actual = Mar value). Both need a follow-up correction.

---

### 12. Action Items — `/action-items` — **AMBER**

**Reads:** `useActionItems` → 46,012 rows, all `open`.

**Current state:** Page works, has an `EmptyState` component (so empty case is handled). But the real problem is **45,898 open action items is not a list, it's a graveyard**.

**CEO gaps:**
- A real human can't action 46K items. There's no aging, no priority sort, no "assigned to me", no "due this week" cut.
- Action items are likely auto-generated from opportunities and never get closed because nothing marks them done.
- The page needs a CEO view: "X overdue · Y due this week · Z assigned to you" — and the rest hidden behind a filter.

**Fix size:** Medium — needs workflow design (when does an item close?), then UI work.

---

### 13. Vault — `/vault` — **AMBER**

**Reads:** `useVaultDocuments` → 30 active (103 lifetime). 1,331-line page.

**Current state:** Most-built page in the app. Lists docs, shows AI ingestion status per row, audit trail.

**CEO gaps:**
- "AI ingested · N tags" is great — but the CEO doesn't know what AI ingestion *did* with that doc. Needs a "Used in: Financial Bible (3 KPIs)" link per doc.
- 73 lifetime deletions (103 − 30). Need a "deleted documents" view for audit, not just hidden.
- Categorization: only 4 doc types in use (other, financial, proposal, market_research). 23 of 30 are "other" — that's the bulk of uploads classified as "miscellaneous." Needs a real taxonomy or LLM-recommended type at upload.

**Fix size:** Small for v1, medium if we add the "used in" backreferences.

---

### 14. Overrides — `/overrides` — **AMBER**

**Reads:** `useOverrideSummary(range)`. Joins `opportunities`, `opportunity_analysis_cache`, `opportunity_decision_overrides` (0 rows), `pipeline_items`, `scored_opps`.

**Current state:** Renders, but `opportunity_decision_overrides` is empty — every analyst decision today is implicit (just moving stage), not recorded as a discrete override.

**CEO gaps:**
- A CEO wants to see "Where did the operator override the system?" Today: 0 such records.
- Either the table is the wrong abstraction, or every pipeline-stage change should write a row here.
- Needs clarifying copy: "0 explicit overrides recorded. Stage moves are tracked in Pipeline."

**Fix size:** Medium — schema decision needed first.

---

### 15. Contacts — `/contacts` — **GREEN**

**Reads:** `govtribe_contacts` (5,036 rows).

**Current state:** Real, populated, has search and edit. Solid.

**CEO gaps:**
- Sourcing: "5,036 contacts from GovTribe, last sync HH:MM" header missing.
- A CEO view would group by agency / by relationship strength — today it's a flat list.

**Fix size:** Trivial header. Optional rollup view later.

---

### 16. Competitors — `/competitors` — **AMBER**

**Reads:** Computed live from `awards` table (64,966) GROUP BY `awardee_name`. LEFT JOIN `competitor_analysis_cache` for LLM-generated profiles.

**Current state:** Works. Real data, real wins, real values.

**CEO gaps:**
- LLM analysis runs lazily (fire-and-forget) on first view of a row — first visit shows blank analysis, then filled silently later. Needs explicit "Analysis pending" → "Analysis as of TIMESTAMP."
- Black Hat Analysis (per-competitor section title visible in code) — needs to call out its sources.
- No "our overlap with this competitor" cut (e.g. shared NAICS / shared agencies highlighted).

**Fix size:** Small.

---

### 17. Risks — `/risks` — **RED**

**Reads:** `useRisks` → `risks` table (1 row).

**Current state:** 1 risk in the database. Page has matrix view + AI generation section.

**CEO gaps:**
- 1 risk is functionally empty.
- "AI Risk Generation" section exists — has it been run? If not, when?
- Per-opportunity risk view (the matrix) won't have data for ~all opportunities.

**Fix size:** Run the AI risk generation as a populated baseline, then small UI work.

---

### 18. Settings — `/settings` — **N/A (admin)**

System health, doctrine, users, notifications. Not part of the CEO surface. But worth noting:
- System Health section status pills ("Connected" / etc.) need source URLs visible — same SITREP standard.
- Doctrine configuration affects every other page's relevance scoring — changes here should write to an audit trail visible from /overrides.

---

### 19. Prompt Creator — `/prompt-creator` — **N/A (admin)**

Internal tool for managing LLM prompts. Not CEO-facing.

---

## Cross-cutting findings

### Findings that affect every page

1. **No global "Data as of" header.** Every page renders without telling you how fresh the data is. The CEO must be able to glance at the top-left and know "this is current as of 06:00 ET today."

2. **No source citation pattern.** Each number/chart should say where it came from. Today some pages show LLM analysis with no provenance. Standard from #815 (`source citation on every data point`) needs to backport to all 17 pages.

3. **Empty states are silent.** Capture (0 captures), Approvals (queue not running), Risks (1 row), Partners (no table), Compliance (0 rows) all just show blank panels. Each needs a precise sentence about *why* it's empty.

4. **Numbers without units / scale.** Pipeline shows counts (5,538) and dollars in the same view without sufficient labeling.

5. **All-or-nothing filtering.** Several pages dump the user into the full firehose (17K opps, 46K action items, 65K awards). CEO default should be a curated "what matters today" view; full list is a click away.

6. **No "regenerate" controls.** Daily Brief and Digest are caches — if the job missed, there's no way for the CEO to force a refresh.

7. **Decision provenance.** Stage changes, no-bid flips, and overrides should be a single audit trail. Today they're scattered (pipeline_items.stage changes vs opportunity_decision_overrides, and the latter is empty).

8. **No emoji.** Confirmed gov/military exec tone — applies to every label, button, and status pill. Spot-check needed across all 19 pages.

9. **ECharts only.** No decorative charts. Charts only when they answer a specific question. Some current pages may have legacy lib charts — needs audit when we go page-by-page.

10. **Print/screenshot at 1280×800.** Every page should fit cleanly at that resolution for sharing with the CEO.

---

## Priority order for fixes

### Tier 1 — Hard blockers (data is wrong or missing)

1. **#815 Financial parsers v2** — IN PROGRESS — Devin
2. **Financial Bible — fix Q1 plan = March plan bug.** Needs follow-up after #815 lands. New issue.
3. **Financial Bible — fix L1-actual parser writing Q1 = March value.** Same — new issue or fold into #815.
4. **Risks — run AI risk generation across all relevant opportunities** to seed a real risk register.
5. **Approvals — verify the match-suggestion worker is running.** If not, fix or remove from nav.

### Tier 2 — CEO-readiness gaps (data exists but presentation isn't exec-grade)

6. **Global "Data as of" status strip** in the app shell (one-time PR, every page benefits).
7. **Source citation footer pattern** propagated to: Launchpad, Daily Brief, Digest, Opportunities, Pipeline, Awards, Contacts, Competitors.
8. **Empty-state copy pass** on: Capture, Approvals, Risks, Partners (if linked), Compliance, Action Items, Fast Track (assessments section), Overrides.
9. **Pipeline exec dashboard** above the list — stage distribution donut + weighted value + decision source.
10. **Opportunities exec default view** — "what matters today" before the 17K firehose.
11. **Action Items aging + priority cuts** — "overdue / due this week / assigned to me."
12. **Auto-no-bid badge** on opportunities/pipeline rows touched by the 30-day rule.

### Tier 3 — Polish (cosmetic, low-risk)

13. Vault: "Used in" backreferences per doc.
14. Vehicles: "Last verified" per row.
15. Contacts: rollup view by agency.
16. Competitors: "Our overlap" cut.
17. Awards: exec rollup card ("awards in our NAICS, last 30 days").

### Tier 4 — Workflow questions for CEO discussion

- The all-`no_bid` pipeline reality: is the operator workflow producing the right inputs? Pipeline depends on Shawn moving items in.
- Action items as 46K open: who is the audience, when does an item close, what's the unit-of-action?
- Overrides table empty: should every stage change write a row, or is this table being deprecated?
- Captures depending on Pursue stage: should we surface this dependency in onboarding text on the Capture page?

---

## What this is not

This assessment is not a code review. It's not a security or performance audit. It's a CEO-readiness audit: if Shawn opens this tool in front of the CEO tomorrow, what would the CEO ask, and what would the answer be?

Several issues are workflow problems, not tool problems — they're called out separately in Tier 4.

---

## Working order for tomorrow

Suggested page-by-page sequence for tomorrow's review (top-down by CEO impact):

1. **Financial Bible** — biggest gap, biggest CEO question
2. **Pipeline** — all-no-bid reality, decision provenance
3. **Opportunities** — exec default view
4. **Launchpad** — first screen the CEO sees
5. **Daily Brief** — second screen
6. **Awards & Intel** — easy win
7. **Action Items** — the 46K problem
8. **Vault** — sourcing backbone
9. **Approvals + Risks + Capture** — verify worker / generation status
10. **Contacts + Competitors + Vehicles + Fast Track + Digest + Overrides** — polish pass

---

*Filed at `docs/dev-notes/2026-06-12_gda-ceo-assessment.md` after review.*
