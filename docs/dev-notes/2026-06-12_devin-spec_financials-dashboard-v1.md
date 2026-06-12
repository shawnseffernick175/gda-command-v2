# Devin spec — Financials Dashboard v1 (data backfill + graceful UX)

## Current state (as of 2026-06-12)

The Financials page (`packages/frontend-v3/src/app/financials/page.tsx`) shows the empty "Connect your ERP or upload a plan" placeholder despite the user having uploaded 30+ financial documents on 2026-06-10. Diagnostic:

```
financial_actuals: 6 rows (FY26 Jan/Feb/Mar/Q1, two sources)
financial_plan:    2 rows (FY26 Mar, FY26 Q1 — INCOMPLETE)
```

The user's Q1 actuals parsed correctly. But:
- The KPI header endpoint (`/v3/kpi/header`) requires a JOIN between actuals AND plan. With plan missing for most periods, it 404s and the UI shows the placeholder.
- `financial_plan` only has 2 rows when the user uploaded `L1-TARGET Proj Revenue Summary MAR-26.xlsx` which contains the full FY26 plan.
- Other uploaded files (`2026 Trend Income Stmt.xlsx`, `2025 GL Detail.xlsx`, TGT vs ACT for Jan/Feb/Mar, Service Center Cost Report) likely contain prior-period actuals + plan data that never got ingested.

## What the user wants

Direct quote: "I would think there would be all kinds of graphs, drillable charts. I got nothing." The user uploaded their entire Q1 financials package and the dashboard is empty. This is the highest-pain issue in the product right now.

## Scope of this PR

### Part A — Backend: Backfill financial data from existing vault uploads

Use the existing parser at `apps/backend-v3/src/services/financials/ingest.ts` to re-process the vault documents already uploaded. Specifically:

1. **L1-TARGET Proj Revenue Summary MAR-26.xlsx** (vault id 73, doc_type=other) → should populate `financial_plan` for all of FY26 (Jan–Dec, plus quarter totals). Currently only March + Q1 populated.
2. **L1-ACTUAL Proj Revenue Summary MAR-26.xlsx** (vault id 86) → should populate `financial_actuals` source='l1_actual' for all periods through March.
3. **2026 Trend Income Stmt.xlsx** (vault id 83, doc_type=financial) → should populate `financial_actuals` source='income_statement' for all FY26 months/quarters available.
4. **2026 Trend Balance Sheet.xlsx** (vault id 82, doc_type=financial) → new table or new source-type for balance-sheet items (see Part B).
5. **2025 GL Detail.xlsx** (vault id 81) → populate `financial_actuals` source='income_statement' for FY25 periods (for year-over-year comparison).
6. **TGT vs ACT JAN-26 / FEB-26 / MAR-26.xlsx** (vault ids 79, 78, 80) → cross-check; should align with already-populated rows.
7. **SIE JAN-26 / FEB-26 / MAR-26 Final.pdf** (vault ids 76, 87, 77) — Statement of Income & Expenses → cross-check actuals.
8. **Service Center Cost Report MAR-2026.pdf** (vault id 74) — cost detail; out of scope for v1, store metadata only.

**Implementation:**
- Create a one-shot backfill script at `apps/backend-v3/src/scripts/backfill_financials_from_vault.ts`.
- For each file in the list above, fetch the vault document binary, run the existing ingest parser, upsert into `financial_actuals` / `financial_plan` (the unique constraint `(source, period, fiscal_year, quarter)` will handle dedup).
- Log every row inserted/updated for audit.
- If the existing ingest parser doesn't handle a particular file format (likely the case for the SIE PDFs and the GL Detail spreadsheet), extend it minimally to cover those formats. Use the AI extraction route (vault `extracted_text` is already populated) as a fallback parser.

### Part B — Backend: Add Balance Sheet support

Currently no table for balance-sheet data. Add migration **v3_075** (next available — v3_074 was used for soak_telemetry):

```sql
CREATE TABLE balance_sheet_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  quarter SMALLINT,
  cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  accounts_receivable NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_current_assets NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_assets NUMERIC(15,2) NOT NULL DEFAULT 0,
  accounts_payable NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_current_liabilities NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_liabilities NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_equity NUMERIC(15,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'balance_sheet',
  UNIQUE (source, period, fiscal_year, quarter)
);
```

Populate from `2026 Trend Balance Sheet.xlsx` and `Balance Sheet FS Detail MAR-2026.pdf`.

Add endpoint `GET /v3/financials/balance-sheet` that returns the latest period plus trend.

### Part C — Backend: Fix KPI header to degrade gracefully

In `apps/backend-v3/src/routes/financials.ts`, change `/v3/kpi/header`:

- Use LEFT JOIN instead of inner JOIN, so it returns actuals even when plan is missing.
- When plan is missing, return `plan: null` and `delta: null` per metric — the frontend already shows the actual value either way.
- Only 404 if BOTH actuals AND plan are completely empty.

### Part D — Frontend: Always show what we have

In `packages/frontend-v3/src/app/financials/page.tsx`:

- If `useKpiHeader()` returns data with any actuals → render the cards (don't gate on plan presence).
- Add a separate "Data Coverage" callout below the cards listing which periods have actuals, which have plan, and which uploads are still being processed (read from `vault_documents` where `doc_type='financial'`).
- Add a third collapsible section: **Balance Sheet** (uses new `/v3/financials/balance-sheet` endpoint). Show Cash, AR, AP, Total Equity as cards. Below: a simple line chart of total assets over time.

### Part E — Frontend: Drill-down

The existing `TrendChart` and `ForecastChart` should be made clickable:

- Clicking a bar/point opens a drawer (use the existing `Sheet` component from shadcn) showing:
  - The period selected
  - All line items for that period (orders, sales, EBIT, gross margin, ROS — both actual and plan side-by-side)
  - Variance % per line
  - A list of source documents from `vault_documents` filtered to that period (link to download)

This gives the user "click → see detail → trace to source" which is the drillable behavior they want.

### Part F — Frontend: Q1 summary card at the top

Above the existing 5 KPI cards, add a hero card showing:

- **FY26 Q1 Results** with Sales ($9.86M), EBIT ($124K), Gross Margin %, ROS %
- Vs FY25 Q1 if FY25 data is now available from backfill
- Vs Plan if plan data is now available
- A "View Q1 income statement" button that opens the SIE Q1 PDF

## Acceptance criteria

After this PR is merged AND the backfill script has run once:

1. The Financials page no longer shows the empty placeholder
2. The 5 KPI cards display with FY26 Q1 actuals visible
3. The Trend chart shows at minimum FY26 Jan/Feb/Mar and (if backfill succeeded) FY25 history
4. The Forecast chart shows actuals vs plan for FY26 with at least Q1 populated
5. Clicking any chart point opens a drill-down drawer with line items and source document links
6. The Balance Sheet section is visible and populated with March 2026 snapshot
7. No charts crash if data for a particular series is missing — they degrade to empty state with a label like "FY25 actuals not yet ingested"

## Out of scope (file separately)

- Cash flow statement (not yet uploaded)
- Quarterly forecasting / projections
- Customer/contract-level revenue breakdown
- Payroll/headcount detail
- The Service Center Cost Report drill-down

## Files to change

**New:**
- `apps/backend-v3/src/scripts/backfill_financials_from_vault.ts`
- `apps/backend-v3/migrations/v3_075_balance_sheet_actuals.sql`
- `db/v3/migrations/v3_075_balance_sheet_actuals.sql`
- `packages/frontend-v3/src/components/financials/PeriodDrillDrawer.tsx`
- `packages/frontend-v3/src/components/financials/BalanceSheetCard.tsx`
- `packages/frontend-v3/src/components/financials/Q1HeroCard.tsx`
- `packages/frontend-v3/src/hooks/use-balance-sheet.ts`

**Modified:**
- `apps/backend-v3/src/routes/financials.ts` (add balance-sheet endpoint, fix KPI header join)
- `apps/backend-v3/src/services/financials/ingest.ts` (extend parsers as needed)
- `packages/frontend-v3/src/app/financials/page.tsx` (compose new layout)
- `packages/frontend-v3/src/components/financials/TrendChart.tsx` (clickable)
- `packages/frontend-v3/src/components/financials/ForecastChart.tsx` (clickable)
- `packages/frontend-v3/src/hooks/use-financials.ts` (handle plan-null case)
- `scripts/ci/migration-manifest.txt` (add v3_075)

## Important notes for Devin

- **The data already exists in vault_documents** — IDs 73, 74, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87. Don't ask the user to re-upload. Read from the vault binaries via the existing vault service.
- **Migration number is v3_075** — not v3_074 (taken by soak_telemetry).
- **The new bare-column drift guard (PR #812) is live** — ensure all new column references match the actual schema.
- **Do NOT introduce a `place_of_performance_state` column or similar.** Stick to existing schema patterns.
- **Pre-existing CI failures** (`Compose Drift Check`, `LLM Router Gates`) will be admin-overridden at merge.
- **After PR merges, run the backfill script ONCE** as part of the deployment — backend rebuild script should call it on first start, or it can be invoked manually via `docker exec gda-backend-v3 node apps/backend-v3/dist/scripts/backfill_financials_from_vault.js`.

## Branch / PR

- Branch: `feat/financials-dashboard-v1`
- Base: latest `main` (post-cleanup-sprint, post-throttle, post-incumbent-fix)
- PR title: `feat: Financials Dashboard v1 — backfill from vault, charts, drill-down, balance sheet`
