// Per-tab AI Analyze data fetchers (F-1142).
//
// The single "AI Analyze" button on the Financial Bible must analyze the DATA
// OF THE ACTIVE TAB. This module fetches each tab's real data — reusing the
// exact query semantics of the corresponding GET endpoint (same tables, same
// superseded_at / source filters) — and summarizes it into a compact,
// LLM-ready object (totals, aging buckets, top rows, variances; row-level
// detail capped so the prompt never carries thousands of raw rows).
//
// No fabrication: when a tab's backing data is empty/null the summary carries
// an explicit `not_ingested` note naming the source needed, so the LLM states
// what is missing instead of inventing figures.

import { pool } from '../../lib/db.js';
import type { FinancialAnalyzeInput } from '../../lib/llm-router.types.js';
import { classifyFinancialDoc } from './reingest-doc.js';
import {
  classifyCoverage,
  primaryTypeOf,
  handlerMatched,
  inferDocPeriod,
  type CoverageDocInput,
} from './coverage.js';

const TAB_LABELS: Record<string, string> = {
  p2: 'Income Statement',
  'balance-sheet': 'Balance Sheet',
  'trial-balance': 'Trial Balance',
  ar: 'Accounts Receivable',
  ap: 'Accounts Payable',
  plan: 'AOP Plan',
  execution: 'AOP Execution',
  waterfall: 'Contract Waterfall',
  'project-revenue': 'Project Revenue',
  'ingestion-coverage': 'Ingestion Coverage',
  definitions: 'Definitions',
  'financial-bible': 'Financial Bible (Pricing)',
  capture: 'AOP Capture',
};

const DEFAULT_TAB = 'p2';
const ROW_CAP = 25;

export function tabLabelFor(tab: string): string {
  return TAB_LABELS[tab] ?? tab;
}

export interface TabAnalysisBuild {
  input: FinancialAnalyzeInput;
  inputs_used: Record<string, unknown>;
  tab: string;
  tab_label: string;
}

/**
 * Fetch and summarize the active tab's real data, returning a fully-populated
 * FinancialAnalyzeInput plus the `inputs_used` object used for verification.
 */
export async function buildTabAnalysisInput(rawTab: string | undefined): Promise<TabAnalysisBuild> {
  const tab = rawTab && TAB_LABELS[rawTab] ? rawTab : DEFAULT_TAB;
  const tab_label = tabLabelFor(tab);

  const base: FinancialAnalyzeInput = {
    ytd_revenue: null,
    ytd_expenses: null,
    ytd_profit: null,
    margin: null,
    funded_backlog: null,
    contracts: [],
    tab,
    tab_label,
    tab_data: null,
  };

  switch (tab) {
    case 'p2':
      return finish(await buildP2(base), tab, tab_label);
    case 'balance-sheet':
      return finish(await buildBalanceSheet(base), tab, tab_label);
    case 'trial-balance':
      return finish(await buildTrialBalance(base), tab, tab_label);
    case 'ar':
      return finish(await buildAr(base), tab, tab_label);
    case 'ap':
      return finish(await buildAp(base), tab, tab_label);
    case 'plan':
      return finish(await buildAopPlan(base), tab, tab_label);
    case 'execution':
      return finish(await buildAopExecution(base), tab, tab_label);
    case 'waterfall':
      return finish(await buildWaterfall(base), tab, tab_label);
    case 'project-revenue':
      return finish(await buildProjectRevenue(base), tab, tab_label);
    case 'ingestion-coverage':
      return finish(await buildIngestionCoverage(base), tab, tab_label);
    case 'financial-bible':
      return finish(await buildFinancialBible(base), tab, tab_label);
    case 'capture':
      return finish(await buildAopCapture(base), tab, tab_label);
    case 'definitions':
      return finish(buildDefinitions(base), tab, tab_label);
    default:
      return finish(await buildP2(base), tab, tab_label);
  }
}

function finish(input: FinancialAnalyzeInput, tab: string, tab_label: string): TabAnalysisBuild {
  // For p2 the verification payload is the enriched P&L fields; for every other
  // tab it is the compact tab_data object actually fetched.
  const inputs_used: Record<string, unknown> = tab === 'p2'
    ? {
        ytd_revenue: input.ytd_revenue,
        ytd_expenses: input.ytd_expenses,
        ytd_profit: input.ytd_profit,
        margin: input.margin,
        direct_costs: input.direct_costs ?? null,
        gross_margin_pct: input.gross_margin_pct ?? null,
        operating_margin_pct: input.operating_margin_pct ?? null,
        funded_backlog: input.funded_backlog,
        contracts: input.contracts,
      }
    : (input.tab_data ?? {});
  return { input, inputs_used, tab, tab_label };
}

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

// ── p2 — Income Statement ────────────────────────────────────────────────
// Preserves the shipped p2 behavior exactly: YTD figures are the SUM of the
// monthly income_statement/l1_actual rows (not a single quarter rollup), which
// is what renders the real $19.03M / $209K / 1.1% analysis. Direct costs come
// from the live (non-superseded) DIRECT pool; the gross-vs-operating margin
// distinction is preserved so the model never conflates the two.
async function buildP2(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const fy = new Date().getUTCFullYear();

  const { rows: aRows } = await pool.query(
    `SELECT DISTINCT ON (period)
       period, source, actual_sales, actual_ebit, actual_gross_margin
     FROM financial_actuals
     WHERE fiscal_year = $1
       AND source IN ('income_statement', 'l1_actual')
       AND is_seed = false
       AND period NOT LIKE '%Q%'
       AND (COALESCE(actual_sales,0) <> 0 OR COALESCE(actual_ebit,0) <> 0)
     ORDER BY period, CASE source WHEN 'income_statement' THEN 1 ELSE 2 END`,
    [fy],
  );
  let ytdRevenue = 0;
  let ytdEbit = 0;
  for (const r of aRows) {
    ytdRevenue += n(r.actual_sales);
    ytdEbit += n(r.actual_ebit);
  }

  const { rows: dcRows } = await pool.query(
    `SELECT COALESCE(SUM(actual_amount),0) AS direct_total
     FROM cost_detail_actuals
     WHERE fiscal_year = $1 AND pool = 'DIRECT' AND superseded_at IS NULL`,
    [fy],
  );
  const directCosts = n(dcRows[0]?.direct_total);

  const { rows: bRows } = await pool.query(
    `SELECT COALESCE(SUM(funded_to_date),0) AS funded_backlog
     FROM task_orders WHERE is_seed = false`,
  );
  const fundedBacklog = n(bRows[0]?.funded_backlog);

  // Per-contract detail: prefer actual_ytd_* columns, fall back to revenue/cost/profit.
  const { rows: cRows } = await pool.query(
    `SELECT project_name AS name,
            COALESCE(SUM(COALESCE(actual_ytd_revenue, revenue)),0) AS revenue,
            COALESCE(SUM(COALESCE(actual_ytd_costs, cost)),0)      AS cost,
            COALESCE(SUM(COALESCE(actual_ytd_profit, profit)),0)   AS profit
     FROM project_revenue_actuals
     WHERE fiscal_year = $1
     GROUP BY project_name
     ORDER BY 2 DESC
     LIMIT 25`,
    [fy],
  ).catch(() => ({ rows: [] as Array<{ name: string; revenue: number; cost: number; profit: number }> }));

  const ebitMargin = ytdRevenue ? (ytdEbit / ytdRevenue) * 100 : null;
  const grossMargin = ytdRevenue ? ((ytdRevenue - directCosts) / ytdRevenue) * 100 : null;

  base.ytd_revenue = ytdRevenue || null;
  base.ytd_expenses = ytdRevenue ? ytdRevenue - ytdEbit : null;
  base.ytd_profit = aRows.length ? ytdEbit : null;
  base.margin = ebitMargin;
  base.gross_margin_pct = grossMargin;
  base.operating_margin_pct = ebitMargin;
  base.direct_costs = directCosts || null;
  base.funded_backlog = fundedBacklog || null;
  base.contracts = cRows.map((r) => {
    const rev = n(r.revenue) || null;
    const cost = n(r.cost) || null;
    const profit = n(r.profit) || (rev !== null && cost !== null ? rev - cost : null);
    return {
      name: r.name as string,
      revenue: rev,
      cost,
      profit,
      margin: rev && profit !== null ? (profit / rev) * 100 : null,
    };
  });
  base.tab_data = {
    fiscal_year: `FY${fy % 100}`,
    months_counted: aRows.length,
    ytd_revenue: base.ytd_revenue,
    ytd_ebit: base.ytd_profit,
    gross_margin_pct: grossMargin,
    operating_margin_pct: ebitMargin,
    direct_costs: base.direct_costs,
    funded_backlog: base.funded_backlog,
  };
  return base;
}

// ── balance-sheet ──────────────────────────────────────────────────────────
async function buildBalanceSheet(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const { rows } = await pool.query(
    `SELECT period, fiscal_year, quarter,
            cash, accounts_receivable,
            total_current_assets, total_assets,
            accounts_payable, total_current_liabilities,
            total_liabilities, total_equity
     FROM balance_sheet_actuals
     ORDER BY fiscal_year DESC, quarter DESC NULLS LAST, period DESC`,
  );
  if (!rows.length) {
    base.tab_data = { not_ingested: 'No balance sheet rows ingested yet. Source needed: monthly/quarterly Balance Sheet.' };
    return base;
  }
  const latest = rows[0];
  const tca = n(latest.total_current_assets);
  const tcl = n(latest.total_current_liabilities);
  base.tab_data = {
    period: latest.period as string,
    cash: n(latest.cash),
    accounts_receivable: n(latest.accounts_receivable),
    total_current_assets: tca,
    total_assets: n(latest.total_assets),
    accounts_payable: n(latest.accounts_payable),
    total_current_liabilities: tcl,
    total_liabilities: n(latest.total_liabilities),
    total_equity: n(latest.total_equity),
    working_capital: tca - tcl,
    current_ratio: tcl > 0 ? Math.round((tca / tcl) * 100) / 100 : null,
    debt_to_equity: n(latest.total_equity) !== 0 ? Math.round((n(latest.total_liabilities) / n(latest.total_equity)) * 100) / 100 : null,
    periods_available: rows.length,
  };
  return base;
}

// ── trial-balance ────────────────────────────────────────────────────────
async function buildTrialBalance(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const { rows } = await pool.query(
    `SELECT period, account_code, account_name, debit, credit, net_balance
     FROM trial_balance
     ORDER BY fiscal_year DESC, quarter DESC, period DESC, account_code`,
  );
  if (!rows.length) {
    base.tab_data = { not_ingested: 'No trial balance rows ingested yet. Source needed: General Ledger / Trial Balance export.' };
    return base;
  }
  const latestPeriod = rows[0].period as string;
  const periodRows = rows.filter((r) => (r.period as string) === latestPeriod);
  const totalDebit = periodRows.reduce((s, r) => s + n(r.debit), 0);
  const totalCredit = periodRows.reduce((s, r) => s + n(r.credit), 0);
  const topAccounts = [...periodRows]
    .sort((a, b) => Math.abs(n(b.net_balance)) - Math.abs(n(a.net_balance)))
    .slice(0, ROW_CAP)
    .map((r) => ({
      account_code: r.account_code as string,
      account_name: r.account_name as string,
      net_balance: n(r.net_balance),
    }));
  base.tab_data = {
    period: latestPeriod,
    account_count: periodRows.length,
    total_debit: Math.round(totalDebit * 100) / 100,
    total_credit: Math.round(totalCredit * 100) / 100,
    imbalance: Math.round((totalDebit - totalCredit) * 100) / 100,
    top_accounts_by_magnitude: topAccounts,
  };
  return base;
}

// ── ar — Accounts Receivable ───────────────────────────────────────────────
async function buildAr(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const { rows } = await pool.query(
    `SELECT customer_name, amount, age_bucket, due_date
     FROM ar_actuals
     ORDER BY fiscal_year DESC, quarter DESC, period DESC, customer_name`,
  );
  if (!rows.length) {
    base.tab_data = { not_ingested: 'No AR rows ingested yet. Source needed: Accounts Receivable aging report.' };
    return base;
  }
  base.tab_data = agingSummary(rows, 'customer_name', 'total_ar');
  return base;
}

// ── ap — Accounts Payable ──────────────────────────────────────────────────
async function buildAp(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const { rows } = await pool.query(
    `SELECT vendor_name, amount, age_bucket, due_date
     FROM ap_actuals
     ORDER BY fiscal_year DESC, quarter DESC, period DESC, vendor_name`,
  );
  if (!rows.length) {
    base.tab_data = { not_ingested: 'No AP rows ingested yet. Source needed: Accounts Payable aging report.' };
    return base;
  }
  base.tab_data = agingSummary(rows, 'vendor_name', 'total_ap');
  return base;
}

function agingSummary(
  rows: Array<Record<string, unknown>>,
  partyKey: 'customer_name' | 'vendor_name',
  totalKey: 'total_ar' | 'total_ap',
): Record<string, unknown> {
  const total = rows.reduce((s, r) => s + n(r.amount), 0);
  const buckets: Record<string, number> = {};
  for (const r of rows) {
    const bucket = (r.age_bucket as string) ?? 'unspecified';
    buckets[bucket] = (buckets[bucket] ?? 0) + n(r.amount);
  }
  const byParty = new Map<string, number>();
  for (const r of rows) {
    const party = (r[partyKey] as string) ?? 'unknown';
    byParty.set(party, (byParty.get(party) ?? 0) + n(r.amount));
  }
  const top = [...byParty.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, ROW_CAP)
    .map(([party, amount]) => ({ [partyKey]: party, amount: Math.round(amount * 100) / 100 }));
  return {
    [totalKey]: Math.round(total * 100) / 100,
    invoice_count: rows.length,
    aging_buckets: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
    top_by_amount: top,
  };
}

// ── plan — AOP Plan ────────────────────────────────────────────────────────
async function buildAopPlan(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const fiscalYear = 2026;
  const { rows } = await pool.query(
    `SELECT SUM(plan_orders) AS plan_orders, SUM(plan_sales) AS plan_sales,
            SUM(plan_ebit) AS plan_ebit, AVG(plan_gross_margin) AS plan_gross_margin,
            AVG(plan_ros) AS plan_ros, COUNT(*) AS month_count
     FROM financial_plan
     WHERE source = 'user_aop' AND is_seed = false
       AND fiscal_year = $1 AND period NOT LIKE '%Q%'`,
    [fiscalYear],
  );
  const r = rows[0];
  if (!r || Number(r.month_count) === 0) {
    base.tab_data = { fiscal_year: `FY${fiscalYear % 100}`, has_plan: false, not_ingested: 'No AOP plan entered yet for this fiscal year. Source needed: owner-entered Annual Operating Plan.' };
    return base;
  }
  base.tab_data = {
    fiscal_year: `FY${fiscalYear % 100}`,
    has_plan: true,
    plan_orders: n(r.plan_orders),
    plan_sales: n(r.plan_sales),
    plan_ebit: n(r.plan_ebit),
    plan_gross_margin_pct: n(r.plan_gross_margin),
    plan_ros_pct: n(r.plan_ros),
    plan_monthly_sales: Math.round((n(r.plan_sales) / 12) * 100) / 100,
  };
  return base;
}

// ── execution — AOP Execution (plan vs actual variance) ──────────────────────
async function buildAopExecution(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const fiscalYear = 2026;
  const { rows: planRows } = await pool.query(
    `SELECT DISTINCT ON (period)
            period, plan_orders, plan_sales, plan_ebit, plan_gross_margin, plan_ros
     FROM financial_plan
     WHERE is_seed = false AND source = 'user_aop'
       AND fiscal_year = $1 AND period NOT LIKE '%Q%'
     ORDER BY period`,
    [fiscalYear],
  );
  const { rows: actualRows } = await pool.query(
    `SELECT DISTINCT ON (period)
            period, source, actual_orders, actual_sales, actual_ebit, actual_gross_margin, actual_ros
     FROM financial_actuals
     WHERE is_seed = false AND source IN ('income_statement', 'l1_actual')
       AND fiscal_year = $1 AND period NOT LIKE '%Q%'
     ORDER BY period, CASE source WHEN 'income_statement' THEN 0 WHEN 'l1_actual' THEN 1 ELSE 2 END`,
    [fiscalYear],
  );
  if (!planRows.length && !actualRows.length) {
    base.tab_data = { fiscal_year: `FY${fiscalYear % 100}`, not_ingested: 'No AOP plan or monthly actuals for this fiscal year. Source needed: AOP plan + monthly income statement.' };
    return base;
  }
  const sum = (rs: Array<Record<string, unknown>>, col: string) =>
    rs.reduce((s, r) => s + n(r[col]), 0);
  const planSales = sum(planRows, 'plan_sales');
  const actualSales = sum(actualRows, 'actual_sales');
  const planEbit = sum(planRows, 'plan_ebit');
  const actualEbit = sum(actualRows, 'actual_ebit');
  const planOrders = sum(planRows, 'plan_orders');
  const actualOrders = sum(actualRows, 'actual_orders');
  base.tab_data = {
    fiscal_year: `FY${fiscalYear % 100}`,
    months_with_plan: planRows.length,
    months_with_actual: actualRows.length,
    sales: { plan: planSales, actual: actualSales, variance: actualSales - planSales },
    ebit: { plan: planEbit, actual: actualEbit, variance: actualEbit - planEbit },
    orders: { plan: planOrders, actual: actualOrders, variance: actualOrders - planOrders },
  };
  return base;
}

// ── waterfall — Contract Waterfall ───────────────────────────────────────────
async function buildWaterfall(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const { rows } = await pool.query(
    `SELECT t.to_name, t.to_number, t.parent_vehicle_short_name,
            t.total_ceiling, t.funded_to_date, t.status,
            cv.short_name AS cv_short_name
     FROM task_orders t
     LEFT JOIN contract_vehicles cv ON cv.id = t.parent_vehicle_id
     WHERE t.is_seed = FALSE
     ORDER BY t.funded_to_date DESC NULLS LAST`,
  );
  if (!rows.length) {
    base.tab_data = { not_ingested: 'No signed task orders ingested yet. Source needed: task order / contract vehicle records.' };
    return base;
  }
  const totalCeiling = rows.reduce((s, r) => s + n(r.total_ceiling), 0);
  const totalFunded = rows.reduce((s, r) => s + n(r.funded_to_date), 0);
  const contracts = rows.slice(0, ROW_CAP).map((r) => {
    const ceiling = n(r.total_ceiling);
    const funded = n(r.funded_to_date);
    return {
      to_name: r.to_name as string,
      to_number: r.to_number as string,
      vehicle: (r.parent_vehicle_short_name as string | null) ?? (r.cv_short_name as string | null),
      ceiling,
      funded,
      unfunded: Math.round((ceiling - funded) * 100) / 100,
      funded_pct: ceiling > 0 ? Math.round((funded / ceiling) * 1000) / 10 : null,
      status: r.status as string,
    };
  });
  base.tab_data = {
    task_order_count: rows.length,
    total_ceiling: Math.round(totalCeiling * 100) / 100,
    total_funded: Math.round(totalFunded * 100) / 100,
    total_unfunded: Math.round((totalCeiling - totalFunded) * 100) / 100,
    contracts,
  };
  return base;
}

// ── project-revenue ──────────────────────────────────────────────────────────
async function buildProjectRevenue(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const { rows: periodRows } = await pool.query(
    `SELECT DISTINCT period FROM project_revenue_actuals ORDER BY period DESC`,
  );
  const effectivePeriod = periodRows[0]?.period as string | undefined;
  if (!effectivePeriod) {
    base.tab_data = { not_ingested: 'No project revenue rows ingested yet. Source needed: per-contract project revenue actuals.' };
    return base;
  }
  const { rows } = await pool.query(
    `SELECT project_name, contract_number, revenue, cost, profit, margin_pct
     FROM project_revenue_actuals
     WHERE period = $1
     ORDER BY revenue DESC NULLS LAST, project_name`,
    [effectivePeriod],
  );
  const totalRevenue = rows.reduce((s, r) => s + n(r.revenue), 0);
  const totalCost = rows.reduce((s, r) => s + n(r.cost), 0);
  const namesOnly = totalRevenue === 0 && totalCost === 0;
  base.tab_data = {
    selected_period: effectivePeriod,
    contract_count: rows.length,
    ...(namesOnly
      ? { not_ingested: 'Per-contract financials (revenue/cost/profit) are not yet ingested for this period — only contract names are present. Source needed: project P&L / revenue-by-contract actuals.' }
      : {
          total_revenue: Math.round(totalRevenue * 100) / 100,
          total_cost: Math.round(totalCost * 100) / 100,
          total_profit: Math.round((totalRevenue - totalCost) * 100) / 100,
        }),
    contracts: rows.slice(0, ROW_CAP).map((r) => ({
      project_name: r.project_name as string,
      contract_number: (r.contract_number as string) ?? null,
      revenue: r.revenue != null ? n(r.revenue) : null,
      cost: r.cost != null ? n(r.cost) : null,
      profit: r.profit != null ? n(r.profit) : null,
      margin_pct: r.margin_pct != null ? n(r.margin_pct) : null,
    })),
  };
  return base;
}

// ── ingestion-coverage ────────────────────────────────────────────────────────
async function buildIngestionCoverage(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const { rows: docs } = await pool.query(
    `SELECT id, filename, doc_type, extraction_status, extracted_text, uploaded_at
     FROM vault_documents
     WHERE deleted_at IS NULL AND (doc_type = 'financial' OR doc_type = 'other')
     ORDER BY uploaded_at DESC`,
  );
  const tables = [
    'financial_actuals', 'balance_sheet_actuals', 'cost_detail_actuals',
    'indirect_expense_actuals', 'ap_actuals', 'ar_actuals',
    'trial_balance', 'project_revenue_actuals',
  ];
  const destinationsByDoc = new Map<number, Array<{ table: string; row_count: number }>>();
  for (const table of tables) {
    const { rows: counts } = await pool.query(
      `SELECT source_doc_id, COUNT(*) AS cnt FROM ${table}
       WHERE source_doc_id IS NOT NULL GROUP BY source_doc_id`,
    );
    for (const c of counts) {
      const docId = Number(c.source_doc_id);
      const cnt = Number(c.cnt ?? 0);
      if (cnt <= 0) continue;
      const list = destinationsByDoc.get(docId) ?? [];
      list.push({ table, row_count: cnt });
      destinationsByDoc.set(docId, list);
    }
  }
  const docInputs: CoverageDocInput[] = docs.flatMap((doc) => {
    const docId = Number(doc.id);
    const filename = doc.filename as string;
    const destinations = destinationsByDoc.get(docId) ?? [];
    const rowCount = destinations.reduce((s, d) => s + d.row_count, 0);
    const docType = (doc.doc_type as string | null) ?? null;
    const cls = classifyFinancialDoc(filename, (doc.extracted_text as string | null) ?? '', docType);
    const matched = handlerMatched(cls);
    if (docType === 'other' && !matched && rowCount === 0) return [];
    return [{
      doc_id: docId,
      filename,
      extraction_status: doc.extraction_status as string,
      row_count: rowCount,
      primary_type: primaryTypeOf(cls),
      period: inferDocPeriod(filename),
      handler_matched: matched,
    }];
  });
  const verdicts = classifyCoverage(docInputs);
  const coverage = docInputs.map((d) => ({
    filename: d.filename,
    status: verdicts.get(d.doc_id)!.status,
    reason: verdicts.get(d.doc_id)!.reason,
    row_count: d.row_count,
  }));
  const attention = coverage
    .filter((c) => c.status === 'not_ingested' || c.status === 'extraction_failed')
    .slice(0, ROW_CAP);
  base.tab_data = {
    total: coverage.length,
    ingested: coverage.filter((c) => c.status === 'ingested').length,
    skipped_duplicate: coverage.filter((c) => c.status === 'skipped_duplicate').length,
    not_ingested: coverage.filter((c) => c.status === 'not_ingested').length,
    extraction_failed: coverage.filter((c) => c.status === 'extraction_failed').length,
    needs_attention: attention,
  };
  return base;
}

// ── financial-bible (Pricing) ─────────────────────────────────────────────────
async function buildFinancialBible(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const { rows } = await pool.query(
    `SELECT v.id, v.uploaded_at, v.uploaded_by, v.format_version, v.summary_stats,
            (SELECT COUNT(*) FROM financial_rates WHERE version_id = v.id) AS rate_count,
            (SELECT COUNT(*) FROM financial_indirects WHERE version_id = v.id) AS indirect_count,
            (SELECT COUNT(*) FROM financial_odc_escalation WHERE version_id = v.id) AS odc_count,
            (SELECT COUNT(*) FROM financial_history WHERE version_id = v.id) AS history_count
     FROM financial_bible_versions v
     WHERE v.active = TRUE
     LIMIT 1`,
  );
  if (!rows.length) {
    base.tab_data = { not_ingested: 'No active Financial Bible pricing version. Source needed: an uploaded and activated pricing bible.' };
    return base;
  }
  const v = rows[0];
  base.tab_data = {
    version_id: v.id,
    uploaded_at: v.uploaded_at,
    format_version: v.format_version,
    rate_count: Number(v.rate_count),
    indirect_count: Number(v.indirect_count),
    odc_count: Number(v.odc_count),
    history_count: Number(v.history_count),
    summary_stats: v.summary_stats ?? null,
  };
  return base;
}

// ── capture — AOP Capture (pipeline) ───────────────────────────────────────────
async function buildAopCapture(base: FinancialAnalyzeInput): Promise<FinancialAnalyzeInput> {
  const captureStages = ['interest', 'qualified', 'pursue', 'solicitation', 'post_submittal'];
  const { rows } = await pool.query(
    `SELECT pi.stage, pi.estimated_value, pi.win_probability
     FROM pipeline_items pi
     WHERE pi.stage = ANY($1)`,
    [captureStages],
  );
  if (!rows.length) {
    base.tab_data = { not_ingested: 'No capture-stage pipeline items. Source needed: pipeline/opportunity records.' };
    return base;
  }
  const byStage: Record<string, { count: number; value: number }> = {};
  let totalValue = 0;
  let weightedValue = 0;
  for (const r of rows) {
    const stage = r.stage as string;
    const value = n(r.estimated_value);
    const pwin = r.win_probability != null ? Number(r.win_probability) : 0;
    byStage[stage] = byStage[stage] ?? { count: 0, value: 0 };
    byStage[stage].count += 1;
    byStage[stage].value += value;
    totalValue += value;
    weightedValue += value * (pwin > 1 ? pwin / 100 : pwin);
  }
  base.tab_data = {
    item_count: rows.length,
    total_pipeline_value: Math.round(totalValue * 100) / 100,
    weighted_pipeline_value: Math.round(weightedValue * 100) / 100,
    by_stage: byStage,
  };
  return base;
}

// ── definitions (reference glossary — low analytical value) ─────────────────────
function buildDefinitions(base: FinancialAnalyzeInput): FinancialAnalyzeInput {
  base.tab_data = {
    note: 'This tab is the static financial glossary (reference only). It defines metrics such as AOP, Backlog, Bookings, Book-to-Bill, Burn Rate, Ceiling, EBIT, Gross Margin, ROS, Wrap Rate, and YTD. There is no period data to analyze.',
  };
  return base;
}
