/**
 * Per-project income statement — aggregation from the project cost-pool book
 * (`project_revenue_actuals`).
 *
 * The company Income Statement is entity-level. This module builds a genuine
 * project-scoped income statement from the per-project cost-pool columns that
 * the "Full Proj Revenue Summary" / cost-pool workbook populates (F-628 /
 * #1203): direct-cost lines (dc_*), indirect pool lines (ind_*), and the
 * stored roll-ups (direct_cost, indirect_cost, gross_profit, profit).
 *
 * Every figure comes straight from the book — no allocation or modeling. A
 * line is `null` (rendered "—") when the book did not populate it for the
 * selected project/period, so a genuine zero stays distinct from "not
 * available" and nothing is fabricated (R1).
 *
 * Aggregation rule: dollar lines SUM across the rows in scope (months ×
 * selected projects); percentage lines are RE-DERIVED from the summed dollars
 * (a margin can never be averaged). A dollar line stays null only when no row
 * in scope carried a value for it.
 */

/** Raw project cost-pool row (subset of `project_revenue_actuals` columns). */
export interface ProjectCostPoolRow {
  project_id: string | null;
  project_name: string;
  contract_number: string | null;
  revenue: number | null;
  /** burdened total cost — the summary column every project row carries */
  cost: number | null;
  direct_cost: number | null;
  indirect_cost: number | null;
  profit: number | null;
  gross_profit: number | null;
  // Direct cost-of-revenue lines
  dc_dl_onsite: number | null;
  dc_dl_offsite: number | null;
  dc_subk_labor: number | null;
  dc_subk_travel: number | null;
  dc_subk_material: number | null;
  dc_consultant_labor: number | null;
  dc_consultant_travel: number | null;
  dc_direct_travel: number | null;
  dc_direct_material: number | null;
  dc_direct_odc: number | null;
  // Indirect pool lines
  ind_oh_onsite: number | null;
  ind_oh_offsite: number | null;
  ind_mhx: number | null;
  ind_gna: number | null;
  source_doc_id: number | null;
}

/** The dollar fields that SUM across rows. */
const DOLLAR_FIELDS = [
  'revenue',
  'cost',
  'direct_cost',
  'indirect_cost',
  'profit',
  'gross_profit',
  'dc_dl_onsite',
  'dc_dl_offsite',
  'dc_subk_labor',
  'dc_subk_travel',
  'dc_subk_material',
  'dc_consultant_labor',
  'dc_consultant_travel',
  'dc_direct_travel',
  'dc_direct_material',
  'dc_direct_odc',
  'ind_oh_onsite',
  'ind_oh_offsite',
  'ind_mhx',
  'ind_gna',
] as const;

type DollarField = (typeof DOLLAR_FIELDS)[number];

/**
 * Breakdown lines that only the per-project cost-pool book carries. Their
 * presence distinguishes a full line-item statement from a burdened-summary
 * one (revenue / cost / profit, which every project row has).
 */
const DETAIL_FIELDS = DOLLAR_FIELDS.filter(
  (f) => f !== 'revenue' && f !== 'cost' && f !== 'profit',
) as Exclude<DollarField, 'revenue' | 'cost' | 'profit'>[];

export type ProjectIncomeStatement = {
  [K in DollarField]: number | null;
} & {
  /** revenue-derived: profit / revenue × 100 */
  margin_pct: number | null;
  /** revenue-derived: gross_profit / revenue × 100 */
  gross_profit_pct: number | null;
  /**
   * True when the cost-pool book carried the direct/indirect line detail for
   * this scope. When false, only the burdened summary (revenue / cost / profit)
   * is available — the detail lines render "—", not fabricated zeros.
   */
  has_cost_pool_detail: boolean;
  /** distinct source document ids backing the figures (R1) */
  source_doc_ids: number[];
};

export interface ProjectIncomeStatementColumn extends ProjectIncomeStatement {
  project_id: string | null;
  project_name: string;
  contract_number: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stable identity for grouping rows into one project column. */
export function projectIdentity(row: {
  project_id: string | null;
  contract_number: string | null;
  project_name: string;
}): string {
  return row.project_id || row.contract_number || row.project_name;
}

/**
 * Sum a set of cost-pool rows into a single income statement.
 * Dollar lines sum (null when no row carried the line); percentages re-derive.
 */
export function aggregateProjectIncomeStatement(
  rows: ProjectCostPoolRow[],
): ProjectIncomeStatement {
  const sums = {} as Record<DollarField, number | null>;
  for (const field of DOLLAR_FIELDS) sums[field] = null;

  const docIds = new Set<number>();

  for (const row of rows) {
    for (const field of DOLLAR_FIELDS) {
      const v = row[field];
      if (v !== null && v !== undefined && Number.isFinite(v)) {
        sums[field] = (sums[field] ?? 0) + v;
      }
    }
    if (row.source_doc_id !== null && row.source_doc_id !== undefined) {
      docIds.add(row.source_doc_id);
    }
  }

  const revenue = sums.revenue;
  const marginPct =
    revenue != null && revenue !== 0 && sums.profit != null
      ? round2((sums.profit / revenue) * 100)
      : null;
  const grossProfitPct =
    revenue != null && revenue !== 0 && sums.gross_profit != null
      ? round2((sums.gross_profit / revenue) * 100)
      : null;

  const rounded = {} as Record<DollarField, number | null>;
  for (const field of DOLLAR_FIELDS) {
    rounded[field] = sums[field] != null ? round2(sums[field] as number) : null;
  }

  // Detail is present only when the cost-pool book populated a breakdown line;
  // the burdened summary (revenue / cost / profit) exists for every project.
  const hasCostPoolDetail = DETAIL_FIELDS.some((f) => sums[f] != null);

  return {
    ...rounded,
    margin_pct: marginPct,
    gross_profit_pct: grossProfitPct,
    has_cost_pool_detail: hasCostPoolDetail,
    source_doc_ids: Array.from(docIds).sort((a, b) => a - b),
  };
}

/**
 * Build one income-statement column per distinct project, ordered by revenue
 * descending (nulls last). Rows are grouped by {@link projectIdentity}.
 */
export function buildProjectColumns(
  rows: ProjectCostPoolRow[],
): ProjectIncomeStatementColumn[] {
  const groups = new Map<string, ProjectCostPoolRow[]>();
  for (const row of rows) {
    const key = projectIdentity(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const columns: ProjectIncomeStatementColumn[] = [];
  for (const bucket of groups.values()) {
    // Prefer identity fields from a row that actually carries revenue/cost.
    const named =
      bucket.find((r) => (r.revenue ?? 0) !== 0 || (r.direct_cost ?? 0) !== 0) ??
      bucket[0];
    columns.push({
      project_id: named.project_id,
      project_name: named.project_name,
      contract_number: named.contract_number,
      ...aggregateProjectIncomeStatement(bucket),
    });
  }

  return columns.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
}
