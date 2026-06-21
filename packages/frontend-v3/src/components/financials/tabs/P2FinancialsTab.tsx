"use client";

import { useP2Financials } from "@/hooks/use-financial-bible";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { NumberCell } from "@/components/financials/primitives/NumberCell";
import { SourceFooter } from "@/components/financials/SourceFooter";
import { formatMoney } from "@/lib/format-money";
import type { IncomeStatementLineItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StatementRow {
  label: string;
  key: keyof IncomeStatementLineItem;
  format: "money" | "percent";
  isSummary?: boolean;
  indent?: boolean;
}

const STATEMENT_ROWS: StatementRow[] = [
  { label: "Revenue", key: "revenue", format: "money", isSummary: true },
  { label: "Direct Costs (COGS)", key: "direct_costs", format: "money", indent: true },
  { label: "Gross Profit", key: "gross_profit", format: "money", isSummary: true },
  { label: "Gross Margin %", key: "gross_margin_pct", format: "percent", indent: true },
  { label: "Operating Expenses", key: "operating_expenses", format: "money", indent: true },
  { label: "EBIT (Operating Income)", key: "ebit", format: "money", isSummary: true },
  { label: "Return on Sales %", key: "ros_pct", format: "percent", indent: true },
  { label: "New Orders (Bookings)", key: "new_orders", format: "money" },
];

function shortPeriod(period: string): string {
  return period.replace(/^FY\d{2}\s+/, "");
}

export function P2FinancialsTab() {
  const { data, isLoading, error } = useP2Financials();

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
          subtitle="From balance sheet / AR aging -- not yet ingested"
        />
        <Kpi
          label="DSO"
          value={"\u2014"}
          subtitle="Requires AR detail -- not yet ingested"
        />
      </div>

      {/* Income Statement — full line-item structure */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Income Statement
        </h3>
        {months.length > 0 ? (
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pl-4 pr-4 text-left font-medium">
                    Line Item
                  </th>
                  {months.map((m) => (
                    <th
                      key={m.period}
                      className="py-2 px-3 text-right font-medium"
                    >
                      {shortPeriod(m.period)}
                    </th>
                  ))}
                  {quarters.map((q) => (
                    <th
                      key={q.period}
                      className="py-2 px-3 text-right font-medium border-l border-border"
                    >
                      {shortPeriod(q.period)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STATEMENT_ROWS.map((row) => (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-b border-border/50",
                      row.isSummary && "bg-card font-medium",
                    )}
                  >
                    <td
                      className={cn(
                        "py-2 pr-4 text-foreground whitespace-nowrap",
                        row.indent ? "pl-8 text-muted-foreground font-normal" : "pl-4",
                      )}
                    >
                      {row.label}
                    </td>
                    {months.map((m) => (
                      <td
                        key={m.period}
                        className="py-2 px-3 text-right"
                      >
                        <NumberCell
                          value={m[row.key] as number}
                          format={row.format}
                        />
                      </td>
                    ))}
                    {quarters.map((q) => (
                      <td
                        key={q.period}
                        className="py-2 px-3 text-right border-l border-border"
                      >
                        <NumberCell
                          value={q[row.key] as number}
                          format={row.format}
                          className={row.isSummary ? "font-semibold" : undefined}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
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
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 pl-4 text-left font-medium">Pool</th>
                  <th className="py-2 pr-4 text-right font-medium">Target</th>
                  <th className="py-2 pr-4 text-right font-medium">Actual</th>
                  <th className="py-2 pr-4 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.cost_by_pool.map((row) => (
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
