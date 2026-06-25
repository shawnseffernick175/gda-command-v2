# Financial Bible — Remediation Spec (source for Devin issues)

Repo: `shawnseffernick175/gda-command-v2`
Backend financials route: `apps/backend-v3/src/routes/financials.ts` (compiled to `dist/routes/financials.js`)
Parsers: `apps/backend-v3/src/services/financials/deterministic-parsers.ts`, `ingest.ts`, `reingest-doc.ts`
Frontend: Financial Bible tabs (React/Next.js).

Reference design: the OLD tool lives in repo `shawnseffernick175/gda-legacy-archive-2026`, `src/App.jsx`. Header reference at `src/App.jsx:5210-5239`.

Verified live facts (do not re-derive, these are confirmed against prod DB):
- `financial_plan` table has NO `source_doc_id` column. All other financial tables do.
- `task_orders`: FORCE = id 5, now is_seed=false, linked to vault doc 194. All other 16 task_orders are is_seed=true (seed/placeholder).
- project_revenue_actuals: ~156 rows/month Jan–May; monthly revenue sums to ~$96M/month which is implausible (company is ~$40M/yr) — parser mapping wrong column.
- 237 project_revenue rows have cost=0 but revenue>0 (forces 100% margin).
- ar_actuals has NO contract field; invoice_number encodes contract (BVN####-F#### = Army; SEV1-/PDNET/INV- = subs). Mapping TBD by user — separate future issue.

---

## ISSUE 1 — Global UI rules (applies to EVERY FB tab)

**G1 — Executive interactive charts on every tab.** Use a real chart library (Recharts). Every tab must have brief-able exec charts: proper axes, axis labels, data point/value labels, legend, tooltips, green=good/red=bad convention, responsive. No bare sparklines, no raw-number dumps as the only viz. The user must be able to brief leadership directly from each tab.

**G2 — Every data table: sticky header + sortable columns.** Always, no exceptions. Header stays fixed on scroll; click any column to sort asc/desc.

**G3 — Number formatting.**
- Input/detail cells: `$xx,xxx,xxx` (comma-grouped, no decimals for whole dollars) and `xx%`.
- KPI tiles: compact `$xx.x` with B/M/K suffix (e.g. `$1.2M`, `$107.3M`, `$2.4B`) and `xx.x%` (one decimal).

**G4 — Visual alignment (NEW, user emphasized "visual is very important").**
- Numbers right-aligned in table columns so decimals/digits line up.
- Labels left-aligned.
- Consistent padding/gutters across tiles and tables.
- KPI tiles same height, values on same baseline.
- Apply across the whole Financial Bible.

---

## ISSUE 2 — KPI Header rebuild (HDR)

Current header (every tab) is a cramped thin strip with tiny font, shows Orders/Sales/EBIT/Gross Margin/ROS, Orders shows $0, no separation. Rebuild to match the OLD tool's executive header.

**Old-tool header spec (target):**
- **6 flat tiles, in this order:** ORDERS · SALES · EBIT · ROS · FUNDED BACKLOG · BACKLOG.
- NOTE: NO "Gross Margin" tile. Remove Gross Margin from the header; add FUNDED BACKLOG and BACKLOG.
- Flat tiles (no card border), centered, thin vertical divider between each (`width:1, height:28, #E5E7EB`).
- Label: 10px, weight 600, uppercase, gray `#6B7280`, letterSpacing 1.
- Value: 16px (bump larger per HDR-1 — make it readable/exec-sized), weight 700. Navy `#1B2A4A` for Orders/Sales/Backlogs; green `#2F5C1F` for EBIT and ROS.
- Format `$xx.xM`/`$xx.xB`, `xx.x%`.
- ⓘ info popover with KPI definitions (defs available in old tool App.jsx:5230-5235).

**HDR-1 — header too small.** Bump value font size and spacing so it reads as an executive KPI row, not a cramped strip. Apply G4 alignment.

**HDR-2 — CY/FY selector ON the header + always-CY-to-date default.**
- Add a CY/FY toggle ON the header bar itself.
- Default = **Calendar-Year-to-date** (Jan 1 → current month) because the header represents "how we're performing right now."
- This header selector is INDEPENDENT from the per-tab FB toggle (do not couple them).
- Show a small note/label on the bar indicating the period basis (e.g. "CY to date" / "FY to date").

**Wiring (the real numbers):**
- The current header query (`/v3/kpi/header`, financials.ts ~line 32) is hardcoded to FY quarter rows (`LIKE '%Q%'`, ORDER BY fiscal_year DESC quarter DESC LIMIT 1) and ignores any toggle. Rewrite so it computes CY-to-date OR FY-to-date depending on the header selector, summing the appropriate month rows.
- **ORDERS** must reflect real booked task orders. FORCE was booked $107,279,341.63 to financial_actuals period 'FY26 Jun' (CY Q2 / FY Q3). Header Orders must include this — CY-to-date through June should show ~$107.3M, not $0. Sum actual_orders across the period months (source precedence income_statement > l1_actual, is_seed=false, DISTINCT ON period).
- SALES/EBIT/ROS: sum/derive from monthly income_statement actuals for the to-date period. ROS = EBIT/Sales.
- FUNDED BACKLOG = sum(task_orders.funded_to_date) where is_seed=false. BACKLOG = sum(task_orders.total_ceiling) where is_seed=false (funded + unfunded). (Currently FORCE only: funded $30K, ceiling $107.3M — that's fine, real data.)

---

## ISSUE 3 — Backend quick fixes + tab cleanup

**IC-1 (CRITICAL) — Ingestion Coverage endpoint 500s.** `GET /v3/financials/ingestion-coverage` (financials.ts ~line 458) loops over 9 tables running `SELECT COUNT(*) ... WHERE source_doc_id=$1`. One table — `financial_plan` — has NO `source_doc_id` column, so the query throws `column "source_doc_id" does not exist` and the whole tab renders "No financial documents found in the Vault" despite 40 docs ingested. Fix: remove `financial_plan` from the `tables` array in that loop (it has no source_doc_id and isn't a per-doc destination). Verify the tab then lists all financial vault docs with their destination tables + row counts.

**CAP-1 — Remove AOP Capture tab from the Financial Bible.** Capture/pipeline belongs in the Capture module, not the FB. Remove the AOP Capture tab from the Financial Bible tab bar. (Do not delete capture functionality elsewhere — just remove it from FB.)

**CW-4 — FORCE note cleanup.** task_orders id=5 notes still reference "Vault ID 120"; it's now linked to vault doc 194. Update the note text accordingly (minor).

---

## ISSUE 4 — Contract Waterfall rebuild (CW-1/2/3)

Current Contract Waterfall (`GET /v3/financials/contract-waterfall`, financials.ts ~line 603) is a Gantt/timeline of task orders (bars pop_start→pop_end, grouped by parent vehicle). That is a contract CALENDAR, not a revenue waterfall.

**Definition (user):** "A contract waterfall is a financial forecast that maps signed contracts and projected pipelines into future revenue or profit streams over a specific timeline."

**CW-1 — Rebuild as a revenue/profit forecast waterfall.**
- For each signed task order (is_seed=false), spread its ceiling into projected revenue over its period of performance.
- **Spread method (user-specified):** ceiling / 12 = annual revenue; annual / 12 = monthly revenue. (Confirm with user if ceiling/12 was meant as monthly — current instruction: ceiling/12 = ANNUAL, then /12 for monthly. FLAG this in the PR for user confirmation.)
- **Two lines: REVENUE and PROFIT.** Provide a toggle (or show both). 
- **Profit line:** revenue × an average margin derived PER CONTRACT from real data (project_revenue_actuals / actuals for that contract). Where no per-contract margin exists, fall back to portfolio-average margin.
- Render as an executive stacked/area chart over a monthly/quarterly timeline (G1), stacked by contract, funded vs unfunded distinguished.

**CW-2 — Only FORCE shows now.** Since FORCE is the only is_seed=false task order, the waterfall currently shows one contract. This is expected until real contracts are loaded; build the waterfall to scale to many contracts. Do NOT seed fake contracts.

**CW-3 — Pipeline layer (future-ready).** The definition includes "projected pipelines." Add a (possibly empty for now) layer for weighted pipeline/capture opportunities on top of signed backlog. If no pipeline data source exists yet, scaffold the layer so it renders empty cleanly and is ready to wire later.

---

## ISSUE 5 — Parser / data-quality fixes

**Project Revenue (PR-1/2/3):**
- PR-1: `/v3/financials/project-revenue` (financials.ts ~line 432) dumps ALL rows all months with no period filter/aggregation; KPI tiles sum all 5 months → $488.6M nonsense. Add a period selector; tiles must reflect a single selected period (or proper ITD), not a blind sum of every month.
- PR-2: monthly per-project revenue ~$96M/month is implausible (company ~$40M/yr). The project-revenue parser is mapping the wrong column (likely contract value or ITD cumulative instead of period revenue). Investigate the source workbook (Proj Revenue Summary) column mapping; map period revenue/cost/profit correctly.
- PR-3: 237 rows have cost=0 but revenue>0 → 100% margin; margin outliers (+/->100%, e.g. -1559.9%). Fix cost column mapping so cost populates; clamp/validate margin_pct.

**Accounts Payable detail (AP-DATA-1/2):**
- AP-DATA-1: all ~210 ap_actuals rows have amount=$0.00 (detail parser not extracting amounts). NOTE: GL AP is fine (BS + TB show correct $6.45M May, tie exactly) — only the DETAIL is broken.
- AP-DATA-2: May missing; Jan=182/Feb=9/Mar=10/Apr=9 rows — detail parser only handles the Jan format. Make it resilient to the other months' formats (dynamic header detection, fuzzy column matching, LLM fallback per the resilient-by-default rule).

**Accounts Receivable aging (AR-DATA-1):**
- Aging only captures 2 of 4 buckets (Current + Over 90); source has Current / 31-60 / 61-90 / Over 90. Parser drops the middle buckets. Capture all 4 aging buckets. (Schema currently single amount/age_bucket per row — that's fine, just don't drop the 31-60 and 61-90 rows.)

**Income Statement + AOP Execution duplicate-source dedup (IS#2 / AOPx-1):**
- IS and AOP Execution pull BOTH income_statement and l1_actual sources without dedup, so months can show two conflicting values (e.g. May EBIT +$13K vs -$24K). The AOP/summary endpoint (financials.ts ~line 768) already does `DISTINCT ON (period)` preferring income_statement. Apply the SAME DISTINCT ON (period) precedence (income_statement > l1_actual) to the Income Statement trend query (financials.ts ~lines 136-154) and the AOP Execution monthly view so each period has one canonical row.
- IS gross-margin unit mismatch (IS#3): income_statement stores GM as PERCENT (e.g. 11.2, 29.5); l1_actual stores GM as FRACTION (0.587). Normalize to one unit before display so YTD margin reconciles.

**Income Statement month ordering (IS#1):** month columns sort alphabetically (FEB before JAN). Sort by fiscal/calendar month order, not alphabetical.

---

## (FUTURE) ISSUE 6 — AR breakdown by contract
Hold until user provides BVN/subcontractor → contract mapping. Then map each ar_actuals invoice (via invoice_number pattern) to its contract and break AR down by contract per month.
