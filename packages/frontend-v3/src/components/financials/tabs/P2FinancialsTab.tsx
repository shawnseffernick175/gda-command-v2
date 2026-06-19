"use client";

import { useP2Financials } from "@/hooks/use-financial-bible";
import { Kpi } from "@/components/financials/primitives/Kpi";
import { NumberCell } from "@/components/financials/primitives/NumberCell";
import { SourceFooter } from "@/components/financials/SourceFooter";
import { formatMoney } from "@/lib/format-money";

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

      {/* Income Statement */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Income Statement
        </h3>
        {data.monthly_actuals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 text-left font-medium">Period</th>
                  <th className="py-2 pr-4 text-left font-medium">Source</th>
                  <th className="py-2 pr-4 text-right font-medium">Orders</th>
                  <th className="py-2 pr-4 text-right font-medium">Sales</th>
                  <th className="py-2 pr-4 text-right font-medium">EBIT</th>
                  <th className="py-2 pr-4 text-right font-medium">Margin</th>
                  <th className="py-2 text-right font-medium">ROS</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly_actuals.map((row, i) => (
                  <tr
                    key={`${row.period}-${row.source}-${i}`}
                    className="border-b border-border/50"
                  >
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {row.period}
                    </td>
                    <td className="py-2 pr-4 text-[11px] text-muted-foreground">
                      {row.source}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell value={row.orders} format="money" />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell value={row.sales} format="money" />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell value={row.ebit} format="money" />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell value={row.gross_margin} format="percent" />
                    </td>
                    <td className="py-2 text-right">
                      <NumberCell value={row.ros} format="percent" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No monthly actuals loaded. Additional line items not yet parsed.
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground italic">
          CTD requires multi-FY parser -- not yet ingested.
        </p>
      </div>

      {/* Contract P&L / Cost by Pool */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Cost Categories (by Pool)
        </h3>
        {data.cost_by_pool.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 text-left font-medium">Pool</th>
                  <th className="py-2 pr-4 text-right font-medium">Target</th>
                  <th className="py-2 pr-4 text-right font-medium">Actual</th>
                  <th className="py-2 text-right font-medium">Variance</th>
                </tr>
              </thead>
              <tbody>
                {data.cost_by_pool.map((row) => (
                  <tr
                    key={row.pool}
                    className="border-b border-border/50"
                  >
                    <td className="py-2 pr-4 font-medium text-foreground">
                      {row.pool}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell value={row.target} format="money" />
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <NumberCell value={row.actual} format="money" />
                    </td>
                    <td className="py-2 text-right">
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
        <p className="mt-2 text-[11px] text-muted-foreground italic">
          Grouped by cost pool. Per-contract P&L requires contract key mapping --
          pending parser enhancement.
        </p>
      </div>

      <SourceFooter meta={data.meta} />
    </div>
  );
}
