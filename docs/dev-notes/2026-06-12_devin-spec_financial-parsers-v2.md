# Devin spec — Financial parsers v2 (Balance Sheet, TGT vs ACT, SIE)

## Context

Envision was acquired by AJ in January 2026. There is **no FY25 historical data** to compare against. All financial data starts FY26 Q1 (Jan 2026) and forward.

Financials Dashboard v1 ([PR #814](https://github.com/shawnseffernick175/gda-command-v2/pull/814), merged 2026-06-12) shipped with:
- KPI header (graceful degradation on missing plan)
- `financial_actuals` + `financial_plan` (populated for Q1 FY26)
- New `balance_sheet_actuals` table (created but EMPTY — no parser exists)
- Backfill script (`apps/backend-v3/src/scripts/backfill_financials_from_vault.ts`)
- Frontend with Q1 hero card, trend chart, forecast chart, drill drawer, balance sheet card

Backfill dry-run on 2026-06-12 17:22 EDT showed: **10 of 14 uploaded financial documents return `not_financial`** from the classifier — but they ARE financial, just not "KPI-shaped." The system needs additional schemas + parsers for these file types.

## Three new parsers to build

### Parser 1 — Balance Sheet

**Files to consume:**
- Vault #82 `2026 Trend Balance Sheet.xlsx` — monthly snapshot Jan/Feb/Mar 2026 (Cash, Billed Receivable, Unbilled Receivable, Other Receivable, Prepaid, Total Current Assets, etc.)
- Vault #84 `Balance Sheet FS Detail MAR-2026.pdf` — full GL detail per balance-sheet line item for March 2026

**Target table:** `balance_sheet_actuals` (already exists, migration v3_076).

**Fields to populate (existing columns):**
- `cash`, `accounts_receivable`, `total_current_assets`, `total_assets`
- `accounts_payable`, `total_current_liabilities`, `total_liabilities`, `total_equity`

**Field mapping (from #82 Trend Balance Sheet):**
- `cash` ← row "Cash"
- `accounts_receivable` ← row "Billed Receivable" + "Unbilled Receivable" (sum)
- `total_current_assets` ← row "Total Current Assets" or sum if not present
- `total_assets` ← row "Total Assets"
- `accounts_payable` ← row "Accounts Payable"
- `total_current_liabilities` ← row "Total Current Liabilities"
- `total_liabilities` ← row "Total Liabilities"
- `total_equity` ← row "Total Equity" or "Total Stockholders' Equity"

Generate 3 rows for FY26 Q1: one each for period `FY26 Jan` / `FY26 Feb` / `FY26 Mar`, with `fiscal_year=2026, quarter=1`, `source='balance_sheet'`.

**LLM task:** Add new task `balance_sheet_extract` to `apps/backend-v3/src/lib/providers/anthropic.ts` SYSTEM_PROMPTS table. Output schema: `{ is_balance_sheet: boolean, rows: BalanceSheetRow[] }`.

**Ingest function:** New `ingestBalanceSheetRows(rows, source_doc_id)` in `apps/backend-v3/src/services/financials/ingest.ts` that upserts into `balance_sheet_actuals` using the existing UNIQUE constraint.

### Parser 2 — TGT vs ACT cost build-up

**Files to consume:**
- Vault #78 `TGT vs ACT FEB-26.xlsx`
- Vault #79 `TGT vs ACT JAN-26.xlsx`
- Vault #80 `TGT vs ACT MAR-26.xlsx`

**Structure (from the existing classifier prompt's description):**
- Sections: `TGT - YTD`, `ACT - YTD`, `VAR`
- Cost elements: DL Offsite, DL Onsite, Subcontractor, Consultant, Dir Travel, Sub Material, Direct Material, ODC
- Columns: DIRECT, OH, SMH, G&A, Total Cost

**Target table (new):** Migration **v3_077**

```sql
CREATE TABLE cost_detail_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,                    -- 'FY26 Jan', 'FY26 Feb', 'FY26 Mar'
  fiscal_year INT NOT NULL,
  quarter SMALLINT NOT NULL,
  cost_element TEXT NOT NULL,              -- 'DL Offsite', 'DL Onsite', 'Subcontractor', ...
  pool TEXT NOT NULL,                      -- 'DIRECT', 'OH', 'SMH', 'G&A', 'Total Cost'
  target_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  variance_amount NUMERIC(15,2) GENERATED ALWAYS AS (actual_amount - target_amount) STORED,
  source TEXT NOT NULL DEFAULT 'tgt_vs_act',
  source_doc_id BIGINT REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, period, cost_element, pool)
);
CREATE INDEX cost_detail_actuals_period_idx ON cost_detail_actuals (fiscal_year, quarter, period);
```

**LLM task:** New `cost_detail_extract` task. Output schema: `{ is_cost_detail: boolean, rows: CostDetailRow[] }`.

**Ingest function:** New `ingestCostDetailRows(rows, source_doc_id)`.

### Parser 3 — SIE (Statement of Indirect Expenses)

**Files to consume:**
- Vault #76 `SIE JAN-26 Final.pdf`
- Vault #87 `SIE FEB-26 Final.pdf`
- Vault #77 `SIE MAR-26 Final.pdf`

**Structure (from sample text inspection):**
- "Statement Of Indirect Expenses" header
- Per-pool sections: Fringe, OH, G&A (with `Group Number` and `Description` like "Total Labor")
- Columns: `Current Period Actual`, `Current Period Budget`, `Year To Date Actual`, `Year To Date Budget`
- Rows: account-level (e.g., `600001 PTO Vacation 13,930.14 0.00 69,477.08 0.00`)

**Target table (new):** Migration **v3_078**

```sql
CREATE TABLE indirect_expense_actuals (
  id BIGSERIAL PRIMARY KEY,
  period TEXT NOT NULL,                    -- 'FY26 Jan'
  fiscal_year INT NOT NULL,
  quarter SMALLINT NOT NULL,
  pool TEXT NOT NULL,                      -- 'Fringe', 'OH', 'G&A'
  account_code TEXT,                       -- '600001'
  account_name TEXT NOT NULL,              -- 'PTO Vacation'
  current_period_actual NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_period_budget NUMERIC(15,2) NOT NULL DEFAULT 0,
  ytd_actual NUMERIC(15,2) NOT NULL DEFAULT 0,
  ytd_budget NUMERIC(15,2) NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'sie',
  source_doc_id BIGINT REFERENCES vault_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, period, pool, account_code, account_name)
);
CREATE INDEX indirect_expense_actuals_period_idx ON indirect_expense_actuals (fiscal_year, quarter, period);
```

**LLM task:** New `sie_extract` task. Output schema: `{ is_sie: boolean, rows: SieRow[] }`.

**Ingest function:** New `ingestSieRows(rows, source_doc_id)`.

## Backfill script update

Update `apps/backend-v3/src/scripts/backfill_financials_from_vault.ts` to:

1. Call all four LLM tasks (`financial_statement_extract`, `balance_sheet_extract`, `cost_detail_extract`, `sie_extract`) per document
2. Route output to the appropriate ingest function based on which task returned non-empty rows
3. Report breakdown in the summary: KPI rows, balance sheet rows, cost detail rows, SIE rows, rejected

A document may legitimately have ZERO matches across all four — that should be reported as `unsupported_format`, NOT `not_financial`.

## API endpoints (new)

Add to `apps/backend-v3/src/routes/financials.ts`:

```
GET /v3/financials/cost-detail?period=FY26+Jan   → cost element × pool matrix for that period
GET /v3/financials/cost-detail/trend             → all periods, all cost elements
GET /v3/financials/indirect-expenses?period=...  → indirect expense breakdown by pool
GET /v3/financials/indirect-expenses/trend       → time series of total indirect by pool
```

Each returns `{ items: [...] }` envelope matching existing financials route style.

## Frontend additions

**New components (under `packages/frontend-v3/src/components/financials/`):**

1. **`CostDetailMatrix.tsx`** — grid of cost element rows × pool columns for the selected period. Cells show `actual / target / variance`. Color-code variance: green if under budget, red if over.

2. **`IndirectExpensePanel.tsx`** — bar chart of indirect costs by pool (Fringe / OH / G&A), Current Period actual vs budget, plus a YTD comparison bar.

3. **`BalanceSheetTrendChart.tsx`** — line chart of Cash, Total AR, Total Assets over Jan / Feb / Mar 2026.

**Page layout update (`packages/frontend-v3/src/app/financials/page.tsx`):**

Add two new collapsible sections below "Balance Sheet":
- **Cost Detail (TGT vs ACT)** — period selector + CostDetailMatrix + drill-down
- **Indirect Expenses (SIE)** — IndirectExpensePanel + per-pool detail table

Update **BalanceSheetCard** to use the new BalanceSheetTrendChart when there are 2+ periods of data.

**Drill drawer extension:** `PeriodDrillDrawer` should now also show:
- Cost detail rows for the selected period
- Indirect expense breakdown for the selected period
- Source documents linked to that period (already implemented)

## Acceptance criteria

After this PR merges AND backfill runs once:

1. `balance_sheet_actuals` has 3 rows (Jan/Feb/Mar 2026)
2. `cost_detail_actuals` has rows for Jan/Feb/Mar 2026 (~8 cost elements × 5 pools × 3 periods ≈ 120 rows)
3. `indirect_expense_actuals` has rows for Jan/Feb/Mar 2026 (one per account per pool per period)
4. Frontend Financials page shows:
   - Q1 hero card (already shipped)
   - KPI header (already shipped)
   - Trend + forecast charts (already shipped)
   - **NEW**: Balance Sheet trend (Cash/AR/Assets over Jan-Mar)
   - **NEW**: Cost Detail matrix
   - **NEW**: Indirect Expense bars by pool
5. Backfill script summary shows `unsupported_format` count = 0 for the known 14 vault docs (with the exception of #74 `Service Center Cost Report` and #81 `2025 GL Detail.xlsx` which are out-of-scope for v2 — those may remain `unsupported_format` and that's acceptable)

## DO NOT

- Do NOT add a `place_of_performance_state` column anywhere
- Do NOT attempt FY25 comparison — there is no FY25 data and the company was acquired in January 2026
- Do NOT modify the existing `financial_actuals` / `financial_plan` ingest path — those work
- Do NOT introduce GL Detail parsing (vault #81 contents do not match the filename; out of scope)

## Migration numbers (sequence matters)

- v3_077 — `cost_detail_actuals`
- v3_078 — `indirect_expense_actuals`

(v3_076 was used by `balance_sheet_actuals` in PR #814)

## CI

- New bare-column schema drift guard (PR #812) is live — all column refs must match actual schema
- Pre-existing failures (`Compose Drift Check`, `LLM Router Gates`, `Build + Bundle Size`) admin-overridden at merge

## Branch / PR

- Branch: `feat/financial-parsers-v2`
- Base: latest `main` (HEAD post-financials-v1)
- PR title: `feat: financial parsers v2 — Balance Sheet, Cost Detail (TGT vs ACT), Indirect Expense (SIE)`

## Post-merge runbook

```bash
# Devin should include these commands in the PR description
docker compose -f docker-compose.prod.yml build backend-v3 frontend-v3
docker compose -f docker-compose.prod.yml up -d backend-v3 frontend-v3
# Backfill (writes data):
docker exec gda-backend-v3 node /app/apps/backend-v3/dist/scripts/backfill_financials_from_vault.js --apply
```
