/**
 * Revenue Summary by Cost Pool — aggregation for the Financial Bible tab of the
 * same name.
 *
 * The tab presents the official "Revenue Summary by Cost Pool" book as Finance
 * reads it: one row per contract for the selected period, every direct and
 * indirect cost pool as its own column, plus the book's own roll-ups (Total
 * Direct, Gross Profit, Total Indirect ACT/TGT, Rate Variance, Op Income) and
 * the per-row contract attributes (contract/vehicle, prime vs sub, contract
 * type) that the chart and filters group by.
 *
 * Every figure is summed straight from `project_revenue_actuals` rows sourced
 * from that book — no allocation, modeling, or defaulting. Aggregation rules:
 *   - dollar pools SUM across the months in scope; a pool stays `null` when no
 *     row in scope carried it, so "not available" never renders as $0 (R1);
 *   - percentages are RE-DERIVED from summed dollars, never averaged;
 *   - attributes are carried from the row that states them (they are per
 *     contract, not per month) and are `null` when the book's layout omits them.
 */

/** Dollar pools/roll-ups that sum across rows. Order drives table + chart order. */
export const DIRECT_POOL_FIELDS = [
  'dc_dl_offsite',
  'dc_dl_onsite',
  'dc_direct_travel',
  'dc_subk_labor',
  'dc_subk_travel',
  'dc_subk_material',
  'dc_consultant_labor',
  'dc_consultant_travel',
  'dc_direct_material',
  'dc_direct_odc',
] as const;

export const INDIRECT_POOL_FIELDS = [
  'ind_oh_offsite',
  'ind_oh_onsite',
  'ind_mhx',
  'ind_gna',
] as const;

const ROLLUP_FIELDS = [
  'revenue',
  'direct_cost',
  'gross_profit',
  'indirect_cost',
  'total_indirect_tgt',
  'rate_variance',
  'cost',
  'profit',
  'itd_revenue',
  'contract_value',
  'total_funded',
] as const;

export const COST_POOL_DOLLAR_FIELDS = [
  ...ROLLUP_FIELDS,
  ...DIRECT_POOL_FIELDS,
  ...INDIRECT_POOL_FIELDS,
] as const;

export type CostPoolDollarField = (typeof COST_POOL_DOLLAR_FIELDS)[number];

/** Per-contract attributes stated by the book (not summed). */
export interface CostPoolAttributes {
  project_id: string | null;
  project_name: string;
  contract_number: string | null;
  division: string | null;
  /** the contract/vehicle/program label, e.g. "RS3 - STEP" */
  contract_label: string | null;
  /** "PRIME", or the prime's name when Envision is the sub */
  prime_or_sub: string | null;
  /** T&M / CPFF / FIXED PRICE */
  proj_type: string | null;
  org_id: string | null;
  pop_start: string | null;
  pop_end: string | null;
  is_active: boolean | null;
}

export type CostPoolSourceRow = CostPoolAttributes & {
  [K in CostPoolDollarField]: number | null;
} & {
  period: string;
  month_num: number | null;
  source_doc_id: number | null;
};

export type CostPoolTotals = {
  [K in CostPoolDollarField]: number | null;
} & {
  /** re-derived: profit / revenue × 100 */
  margin_pct: number | null;
  /** re-derived: gross_profit / revenue × 100 */
  gross_profit_pct: number | null;
  source_doc_ids: number[];
};

export type CostPoolProjectRow = CostPoolAttributes & CostPoolTotals;

export interface CostPoolPeriodPoint extends CostPoolTotals {
  period: string;
  month_num: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Stable identity for folding a contract's monthly rows into one row. */
export function costPoolIdentity(row: CostPoolAttributes): string {
  return row.project_id || row.contract_number || row.project_name;
}

/**
 * Sum rows into one set of totals. Dollar fields are null-preserving: a field is
 * null only when NO row in scope carried it. Percentages re-derive from sums.
 */
export function aggregateCostPoolRows(rows: CostPoolSourceRow[]): CostPoolTotals {
  const sums = {} as Record<CostPoolDollarField, number | null>;
  for (const f of COST_POOL_DOLLAR_FIELDS) sums[f] = null;

  const docIds = new Set<number>();

  for (const row of rows) {
    for (const f of COST_POOL_DOLLAR_FIELDS) {
      const v = row[f];
      if (v !== null && v !== undefined && Number.isFinite(v)) {
        sums[f] = (sums[f] ?? 0) + v;
      }
    }
    if (row.source_doc_id != null) docIds.add(row.source_doc_id);
  }

  // Contract Value / Total Funded / ITD Revenue are contract-level standing
  // figures restated on every monthly row, so summing them would multiply the
  // contract by its month count. Take the value the book states, not a sum.
  for (const f of ['contract_value', 'total_funded', 'itd_revenue'] as const) {
    const stated = latestStated(rows, f);
    sums[f] = stated;
  }

  const rounded = {} as Record<CostPoolDollarField, number | null>;
  for (const f of COST_POOL_DOLLAR_FIELDS) {
    rounded[f] = sums[f] != null ? round2(sums[f] as number) : null;
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

  return {
    ...rounded,
    margin_pct: marginPct,
    gross_profit_pct: grossProfitPct,
    source_doc_ids: Array.from(docIds).sort((a, b) => a - b),
  };
}

/**
 * A standing per-contract figure as of the latest month in scope that states it
 * (contract value can be modified mid-year; the latest statement is current).
 * Across several contracts the stated values sum, so this folds per identity.
 */
function latestStated(
  rows: CostPoolSourceRow[],
  field: 'contract_value' | 'total_funded' | 'itd_revenue',
): number | null {
  const byContract = new Map<string, { month: number; value: number }>();
  for (const row of rows) {
    const v = row[field];
    if (v == null || !Number.isFinite(v)) continue;
    const key = costPoolIdentity(row);
    const month = row.month_num ?? 0;
    const prev = byContract.get(key);
    if (!prev || month >= prev.month) byContract.set(key, { month, value: v });
  }
  if (byContract.size === 0) return null;
  let total = 0;
  for (const { value } of byContract.values()) total += value;
  return total;
}

/** First non-null attribute value across rows (attributes are per contract). */
function firstAttr<K extends keyof CostPoolAttributes>(
  rows: CostPoolSourceRow[],
  key: K,
): CostPoolAttributes[K] {
  for (const r of rows) {
    const v = r[key];
    if (v !== null && v !== undefined && v !== '') return v;
  }
  return rows[0]?.[key] ?? (null as CostPoolAttributes[K]);
}

/**
 * One row per contract for the period in scope, revenue-descending (the book's
 * own reading order for an executive review).
 */
export function buildCostPoolProjectRows(rows: CostPoolSourceRow[]): CostPoolProjectRow[] {
  const groups = new Map<string, CostPoolSourceRow[]>();
  for (const row of rows) {
    const key = costPoolIdentity(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const out: CostPoolProjectRow[] = [];
  for (const bucket of groups.values()) {
    const ordered = [...bucket].sort((a, b) => (a.month_num ?? 0) - (b.month_num ?? 0));
    out.push({
      project_id: firstAttr(ordered, 'project_id'),
      project_name: firstAttr(ordered, 'project_name'),
      contract_number: firstAttr(ordered, 'contract_number'),
      division: firstAttr(ordered, 'division'),
      contract_label: firstAttr(ordered, 'contract_label'),
      prime_or_sub: firstAttr(ordered, 'prime_or_sub'),
      proj_type: firstAttr(ordered, 'proj_type'),
      org_id: firstAttr(ordered, 'org_id'),
      pop_start: firstAttr(ordered, 'pop_start'),
      pop_end: firstAttr(ordered, 'pop_end'),
      is_active: firstAttr(ordered, 'is_active'),
      ...aggregateCostPoolRows(ordered),
    });
  }

  return out.sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
}

/** Monthly series for the trend chart, in fiscal-period order. */
export function buildCostPoolPeriodSeries(rows: CostPoolSourceRow[]): CostPoolPeriodPoint[] {
  const groups = new Map<string, CostPoolSourceRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.period);
    if (bucket) bucket.push(row);
    else groups.set(row.period, [row]);
  }

  const points: CostPoolPeriodPoint[] = [];
  for (const [period, bucket] of groups.entries()) {
    points.push({
      period,
      month_num: bucket.find((r) => r.month_num != null)?.month_num ?? null,
      ...aggregateCostPoolRows(bucket),
    });
  }

  return points.sort((a, b) => (a.month_num ?? 0) - (b.month_num ?? 0));
}
