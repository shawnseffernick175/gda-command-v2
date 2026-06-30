"use client";

import { useP2Financials } from "@/hooks/use-financial-bible";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { NumberCell } from "@/components/financials/primitives/NumberCell";
import { SourceFooter } from "@/components/financials/SourceFooter";
import { formatMoney } from "@/lib/format-money";
import type { IncomeStatementLineItem, CostDetailItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { useTableSort } from "@/hooks/use-table-sort";
import { sortData, type ColumnSortConfig } from "@/lib/sort-utils";
import { echarts, ReactEChartsCore } from "@/lib/echarts-setup";

const POOL_SORT_COLS: ColumnSortConfig[] = [
  { field: "pool", type: "string" },
  { field: "target", type: "number" },
  { field: "actual", type: "number" },
  { field: "variance", type: "number" },
];

/* ── Income Statement row definitions ──
 *
 * "summary" rows use the derived fields from financial_actuals (Revenue, Gross
 * Profit, EBIT, etc.) — these are the authoritative, audited figures.
 *
 * "detail" rows pull from cost_detail_actuals / indirect_expense_actuals for
 * the per-period breakdown. When detail data is absent the summary lines still
 * render correctly; detail rows degrade to "—".
 *
 * Row types:
 *   summary   — bold line derived from financial_actuals
 *   detail    — indented line from cost_detail or indirect breakdown
 *   section   — gray section header (no numbers)
 *   separator — blank visual spacer row
 */

type RowKind = "summary" | "detail" | "section" | "separator";

interface StatementRowDef {
  kind: RowKind;
  label: string;
  /** For summary rows: which field on IncomeStatementLineItem to read */
  key?: keyof IncomeStatementLineItem;
  /** For detail rows: which breakdown map to read (direct / indirect) */
  detailSource?: "direct" | "indirect";
  /** For detail rows: the label key to match in the breakdown array */
  detailKey?: string;
  format?: "money" | "percent";
  /** Visual nesting depth (0 = flush left, 1 = indented) */
  indent?: number;
}

const STATEMENT_ROWS: StatementRowDef[] = [
  // ── Revenue ──
  { kind: "section", label: "Revenue" },
  { kind: "summary", label: "Total Revenue", key: "revenue", format: "money" },

  // ── Cost of Revenue ──
  { kind: "section", label: "Cost of Revenue (Direct Costs)" },
  { kind: "detail", label: "Direct Labor — Onsite", detailSource: "direct", detailKey: "DL Onsite", format: "money", indent: 1 },
  { kind: "detail", label: "Direct Labor — Offsite", detailSource: "direct", detailKey: "DL Offsite", format: "money", indent: 1 },
  { kind: "detail", label: "Subcontractor", detailSource: "direct", detailKey: "Subcontractor", format: "money", indent: 1 },
  { kind: "detail", label: "Consultant", detailSource: "direct", detailKey: "Consultant", format: "money", indent: 1 },
  { kind: "detail", label: "Travel", detailSource: "direct", detailKey: "Dir Travel", format: "money", indent: 1 },
  { kind: "detail", label: "Sub Material", detailSource: "direct", detailKey: "Sub Material", format: "money", indent: 1 },
  { kind: "detail", label: "Direct Material", detailSource: "direct", detailKey: "Direct Material", format: "money", indent: 1 },
  { kind: "detail", label: "Other Direct Costs (ODC)", detailSource: "direct", detailKey: "ODC", format: "money", indent: 1 },
  { kind: "summary", label: "Total Direct Costs", key: "direct_costs", format: "money" },

  { kind: "separator", label: "" },

  // ── Gross Profit ──
  { kind: "summary", label: "Gross Profit", key: "gross_profit", format: "money" },
  { kind: "detail", label: "Gross Margin %", key: "gross_margin_pct", format: "percent", indent: 1 },

  { kind: "separator", label: "" },

  // ── Operating Expenses ──
  { kind: "section", label: "Operating Expenses (Indirect)" },
  { kind: "detail", label: "Fringe Benefits", detailSource: "indirect", detailKey: "Fringe", format: "money", indent: 1 },
  { kind: "detail", label: "Overhead", detailSource: "indirect", detailKey: "Overhead", format: "money", indent: 1 },
  { kind: "detail", label: "Selling, Marketing & Handling", detailSource: "indirect", detailKey: "SMH", format: "money", indent: 1 },
  { kind: "detail", label: "General & Administrative", detailSource: "indirect", detailKey: "G&A", format: "money", indent: 1 },
  { kind: "summary", label: "Total Operating Expenses", key: "operating_expenses", format: "money" },

  { kind: "separator", label: "" },

  // ── Operating Income ──
  { kind: "summary", label: "EBIT (Operating Income)", key: "ebit", format: "money" },
  { kind: "detail", label: "Return on Sales %", key: "ros_pct", format: "percent", indent: 1 },

  { kind: "separator", label: "" },

  // ── Bookings ──
  { kind: "summary", label: "New Orders (Bookings)", key: "new_orders", format: "money" },
];

function shortPeriod(period: string): string {
  return period.replace(/^FY\d{2}\s+/, "");
}

const QUARTER_MONTHS: Record<string, string[]> = {
  Q1: ["Oct", "Nov", "Dec"],
  Q2: ["Jan", "Feb", "Mar"],
  Q3: ["Apr", "May", "Jun"],
  Q4: ["Jul", "Aug", "Sep"],
};

function resolveDetailValue(
  period: string,
  row: StatementRowDef,
  directDetail: Record<string, CostDetailItem[]>,
  indirectDetail: Record<string, CostDetailItem[]>,
): number | null {
  if (!row.detailSource || !row.detailKey) return null;

  const map = row.detailSource === "direct" ? directDetail : indirectDetail;
  const key = row.detailKey.toLowerCase();

  // Quarter periods (e.g. "FY26 Q1"): sum constituent months
  const qMatch = period.match(/^(FY\d{2})\s+(Q[1-4])$/);
  if (qMatch) {
    const prefix = qMatch[1];
    const months = QUARTER_MONTHS[qMatch[2]];
    if (!months) return null;
    let sum = 0;
    let hasAny = false;
    for (const mon of months) {
      const monthPeriod = `${prefix} ${mon}`;
      const items = map[monthPeriod];
      if (!items) continue;
      const found = items.find((i) => i.label.toLowerCase() === key);
      if (found) {
        sum += found.amount;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }

  // Monthly period: direct lookup
  const items = map[period];
  if (!items) return null;
  const found = items.find((i) => i.label.toLowerCase() === key);
  return found ? found.amount : null;
}

function resolveCellValue(
  periodData: IncomeStatementLineItem | undefined,
  row: StatementRowDef,
  period: string,
  directDetail: Record<string, CostDetailItem[]>,
  indirectDetail: Record<string, CostDetailItem[]>,
): number | null {
  if (row.kind === "section" || row.kind === "separator") return null;

  if (row.key && periodData) {
    return periodData[row.key] as number;
  }

  if (row.detailSource) {
    return resolveDetailValue(period, row, directDetail, indirectDetail);
  }

  return null;
}

export function P2FinancialsTab() {
  const { data, isLoading, error } = useP2Financials();
  const { sortBy, sortDir, handleSort } = useTableSort("p2pool");

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading monthly financials...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-gda-red">
        Failed to load P2 data: {error.message}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No financial data available. Upload financial documents to the Vault to
          populate this tab.
        </p>
      </div>
    );
  }

  const kpi = data.kpi;
  const plan = data.plan;
  const stmt = data.income_statement;
  const months = stmt?.months ?? [];
  const quarters = stmt?.quarters ?? [];
  const directDetail = stmt?.direct_cost_detail ?? {};
  const indirectDetail = stmt?.indirect_cost_detail ?? {};

  const monthByPeriod = new Map<string, IncomeStatementLineItem>();
  for (const m of months) monthByPeriod.set(m.period, m);
  const quarterByPeriod = new Map<string, IncomeStatementLineItem>();
  for (const q of quarters) quarterByPeriod.set(q.period, q);

  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label="YTD Revenue"
          value={kpi ? formatMoney(kpi.ytd_revenue) : "\u2014"}
          subtitle={plan ? `Plan: ${formatMoney(plan.plan_sales)}` : null}
        />
        <Kpi
          label="YTD Expenses"
          value={kpi ? formatMoney(kpi.ytd_expenses) : "\u2014"}
        />
        <Kpi
          label="YTD Profit"
          value={kpi ? formatMoney(kpi.ytd_profit) : "\u2014"}
          subtitle={plan ? `Plan: ${formatMoney(plan.plan_ebit)}` : null}
        />
        <Kpi
          label="YTD Margin"
          value={kpi ? `${kpi.ytd_margin.toFixed(1)}%` : "\u2014"}
          subtitle={
            plan ? `Plan: ${plan.plan_gross_margin.toFixed(1)}%` : null
          }
        />
        <Kpi
          label="Funded Backlog"
          value={"\u2014"}
          subtitle="From balance sheet / AR aging"
        />
        <Kpi
          label="DSO"
          value={"\u2014"}
          subtitle="Requires AR detail"
        />
      </div>

      {/* Revenue Trend Chart */}
      {months.length > 0 && (
        <div className="rounded border border-border bg-white p-4">
          <p className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            Revenue & Profit Trend
          </p>
          <ReactEChartsCore
            echarts={echarts}
            style={{ height: 240 }}
            notMerge
            option={{
              tooltip: {
                trigger: "axis" as const,
                axisPointer: { type: "cross" as const },
              },
              legend: {
                data: ["Revenue", "Gross Profit", "EBIT"],
                textStyle: { color: "var(--color-fin-stone)", fontSize: 11 },
              },
              grid: { left: 60, right: 16, top: 32, bottom: 32 },
              xAxis: {
                type: "category" as const,
                data: months.map((m) => shortPeriod(m.period)),
                axisLabel: { color: "var(--color-fin-stone)", fontSize: 11 },
                axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
              },
              yAxis: {
                type: "value" as const,
                axisLabel: {
                  color: "var(--color-fin-stone)",
                  fontSize: 11,
                  formatter: (v: number) => formatMoney(v),
                },
                splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
              },
              series: [
                {
                  name: "Revenue",
                  type: "bar" as const,
                  data: months.map((m) => m.revenue),
                  itemStyle: { color: "var(--color-fin-navy)" },
                },
                {
                  name: "Gross Profit",
                  type: "line" as const,
                  data: months.map((m) => m.gross_profit),
                  lineStyle: { color: "var(--color-gda-green)" },
                  itemStyle: { color: "var(--color-gda-green)" },
                },
                {
                  name: "EBIT",
                  type: "line" as const,
                  data: months.map((m) => m.ebit),
                  lineStyle: { color: "var(--color-fin-plum)" },
                  itemStyle: { color: "var(--color-fin-plum)" },
                },
              ],
            }}
          />
        </div>
      )}

      {/* Income Statement — full line-item structure */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Income Statement
        </h3>
        {months.length > 0 ? (
          <div className="overflow-x-auto rounded border border-border max-h-[640px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pl-4 pr-4 text-left font-medium min-w-[220px]">
                    Line Item
                  </th>
                  {months.map((m) => (
                    <th
                      key={m.period}
                      className="py-2 px-3 text-right font-medium whitespace-nowrap"
                    >
                      {shortPeriod(m.period)}
                    </th>
                  ))}
                  {quarters.map((q) => (
                    <th
                      key={q.period}
                      className="py-2 px-3 text-right font-medium border-l border-border whitespace-nowrap"
                    >
                      {shortPeriod(q.period)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STATEMENT_ROWS.map((row, idx) => {
                  if (row.kind === "separator") {
                    return (
                      <tr key={`sep-${idx}`} className="h-2">
                        <td colSpan={1 + months.length + quarters.length} />
                      </tr>
                    );
                  }

                  if (row.kind === "section") {
                    return (
                      <tr
                        key={`sec-${idx}`}
                        className="bg-gda-bg-base"
                      >
                        <td
                          colSpan={1 + months.length + quarters.length}
                          className="py-2 pl-4 text-[11px] uppercase tracking-wider text-muted-foreground font-medium"
                        >
                          {row.label}
                        </td>
                      </tr>
                    );
                  }

                  const isSummary = row.kind === "summary";

                  return (
                    <tr
                      key={`${row.label}-${idx}`}
                      className={cn(
                        "border-b border-border/50",
                        isSummary && "bg-card font-medium",
                      )}
                    >
                      <td
                        className={cn(
                          "py-2 pr-4 whitespace-nowrap",
                          row.indent ? "pl-8" : "pl-4",
                          isSummary
                            ? "text-foreground font-medium"
                            : "text-muted-foreground font-normal",
                        )}
                      >
                        {row.label}
                      </td>
                      {months.map((m) => {
                        const val = resolveCellValue(
                          monthByPeriod.get(m.period),
                          row,
                          m.period,
                          directDetail,
                          indirectDetail,
                        );
                        return (
                          <td key={m.period} className="py-2 px-3 text-right">
                            <NumberCell
                              value={val}
                              format={row.format}
                            />
                          </td>
                        );
                      })}
                      {quarters.map((q) => {
                        const val = resolveCellValue(
                          quarterByPeriod.get(q.period),
                          row,
                          q.period,
                          directDetail,
                          indirectDetail,
                        );
                        return (
                          <td
                            key={q.period}
                            className="py-2 px-3 text-right border-l border-border"
                          >
                            <NumberCell
                              value={val}
                              format={row.format}
                              className={isSummary ? "font-semibold" : undefined}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No income statement data loaded. Upload Trended Income Statement
            documents via Vault to populate this view.
          </p>
        )}
      </div>

      {/* Cost Categories (by Pool) */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Cost Categories (by Pool)
        </h3>
        {data.cost_by_pool.length > 0 ? (
          <div className="overflow-x-auto rounded border border-border max-h-[480px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-gda-bg-base text-[11px] uppercase tracking-wider text-muted-foreground">
                  <SortableHeader label="Pool" field="pool" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                  <SortableHeader label="Target" field="target" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Actual" field="actual" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                  <SortableHeader label="Variance" field="variance" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {(sortBy
                  ? sortData(data.cost_by_pool as unknown as Record<string, unknown>[], sortBy, sortDir, POOL_SORT_COLS) as unknown as typeof data.cost_by_pool
                  : data.cost_by_pool
                ).map((row) => (
                  <tr
                    key={row.pool}
                    className="border-b border-border/50"
                  >
                    <td className="py-2 pr-4 pl-4 font-medium text-foreground">
                      {row.pool}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell value={row.target} format="money" />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell value={row.actual} format="money" />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell
                        value={row.variance}
                        format="money"
                        className={
                          row.variance > 0
                            ? "text-gda-green-muted"
                            : row.variance < 0
                              ? "text-gda-red"
                              : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No cost detail data. Upload cost detail (TGT vs ACT) documents via
            Vault.
          </p>
        )}
      </div>

      <SourceFooter meta={data.meta} />
    </div>
  );
}
