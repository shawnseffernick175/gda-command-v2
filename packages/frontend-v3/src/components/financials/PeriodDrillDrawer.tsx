"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  usePeriodDetail,
  useCostDetail,
  useIndirectExpenses,
} from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import { cn } from "@/lib/utils";

export function PeriodDrillDrawer({
  period,
  open,
  onOpenChange,
}: {
  period: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading } = usePeriodDetail(open ? period : null);
  const { data: costData } = useCostDetail(open ? period : null);
  const { data: sieData } = useIndirectExpenses(open ? period : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{period ?? "Period"} — Drill-Down</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="h-32 animate-pulse rounded bg-gda-panel" />
        ) : data ? (
          <div className="space-y-4">
            {data.actuals.length > 0 && (
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Actuals
                </h3>
                {data.actuals.map((a) => (
                  <MetricsRow key={a.source} label={a.source} metrics={a} />
                ))}
              </div>
            )}

            {data.plans.length > 0 && (
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Plan
                </h3>
                {data.plans.map((p) => (
                  <MetricsRow key={p.source} label={p.source} metrics={p} />
                ))}
              </div>
            )}

            {data.actuals.length > 0 && data.plans.length > 0 && (
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Variance
                </h3>
                <VarianceTable
                  actuals={data.actuals[0]}
                  plan={data.plans[0]}
                />
              </div>
            )}

            {/* Cost Detail rows for this period */}
            {costData && costData.items.length > 0 && (
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Cost Detail (TGT vs ACT)
                </h3>
                <div className="rounded border border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">
                          Element
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Pool
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Target
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Actual
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Variance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {costData.items.map((r) => (
                        <tr
                          key={`${r.cost_element}-${r.pool}`}
                          className="border-b border-border"
                        >
                          <td className="px-3 py-1.5 text-foreground">
                            {r.cost_element}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {r.pool}
                          </td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                            {formatMoney(r.target_amount)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-foreground tabular-nums">
                            {formatMoney(r.actual_amount)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right tabular-nums",
                              r.variance_amount > 0
                                ? "text-gda-red"
                                : "text-gda-green-muted",
                            )}
                          >
                            {formatMoney(r.variance_amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Indirect Expense rows for this period */}
            {sieData && sieData.items.length > 0 && (
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Indirect Expenses (SIE)
                </h3>
                <div className="rounded border border-border overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
                        <th className="px-3 py-2 text-left font-medium">
                          Pool
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          Account
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Actual
                        </th>
                        <th className="px-3 py-2 text-right font-medium">
                          Budget
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sieData.items.map((r) => (
                        <tr
                          key={`${r.pool}-${r.account_code ?? ""}-${r.account_name}`}
                          className="border-b border-border"
                        >
                          <td className="px-3 py-1.5 text-foreground font-medium">
                            {r.pool}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {r.account_code ? `${r.account_code} ` : ""}
                            {r.account_name}
                          </td>
                          <td className="px-3 py-1.5 text-right text-foreground tabular-nums">
                            {formatMoney(r.current_period_actual)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">
                            {formatMoney(r.current_period_budget)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.source_documents.length > 0 && (
              <div>
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
                  Source Documents
                </h3>
                <div className="space-y-1">
                  {data.source_documents.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between rounded border border-border px-3 py-2 text-xs"
                    >
                      <span className="text-foreground truncate max-w-[260px]">
                        {d.filename}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {d.doc_type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-4">
            No detail data available for this period
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  income_statement: "Income Statement",
  l1_actual: "L1-ACTUAL",
  l1_target: "L1-TARGET",
};

function MetricsRow({
  label,
  metrics,
}: {
  label: string;
  metrics: {
    orders: number;
    sales: number;
    ebit: number;
    gross_margin: number;
    ros: number;
  };
}) {
  const displayLabel = SOURCE_LABELS[label] ?? label;
  return (
    <div className="rounded border border-border p-3 mb-2">
      <p className="text-[11px] text-muted-foreground mb-1.5">
        {displayLabel}
      </p>
      <div className="grid grid-cols-5 gap-2 text-xs">
        <div>
          <span className="text-[11px] text-muted-foreground">Orders</span>
          <p className="text-foreground tabular-nums">
            {formatMoney(metrics.orders)}
          </p>
        </div>
        <div>
          <span className="text-[11px] text-muted-foreground">Sales</span>
          <p className="text-foreground tabular-nums">
            {formatMoney(metrics.sales)}
          </p>
        </div>
        <div>
          <span className="text-[11px] text-muted-foreground">EBIT</span>
          <p
            className={cn(
              "tabular-nums",
              metrics.ebit >= 0 ? "text-foreground" : "text-gda-red",
            )}
          >
            {formatMoney(metrics.ebit)}
          </p>
        </div>
        <div>
          <span className="text-[11px] text-muted-foreground">GM%</span>
          <p className="text-foreground tabular-nums">
            {metrics.gross_margin.toFixed(1)}%
          </p>
        </div>
        <div>
          <span className="text-[11px] text-muted-foreground">ROS%</span>
          <p className="text-foreground tabular-nums">
            {metrics.ros.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  );
}

function VarianceTable({
  actuals,
  plan,
}: {
  actuals: {
    orders: number;
    sales: number;
    ebit: number;
    gross_margin: number;
    ros: number;
  };
  plan: {
    orders: number;
    sales: number;
    ebit: number;
    gross_margin: number;
    ros: number;
  };
}) {
  const pctVar = (actual: number, planVal: number) =>
    planVal === 0 ? null : ((actual - planVal) / planVal) * 100;

  const rows = [
    { label: "Orders", actual: actuals.orders, plan: plan.orders, isMoney: true },
    { label: "Sales", actual: actuals.sales, plan: plan.sales, isMoney: true },
    { label: "EBIT", actual: actuals.ebit, plan: plan.ebit, isMoney: true },
    {
      label: "Gross Margin",
      actual: actuals.gross_margin,
      plan: plan.gross_margin,
      isMoney: false,
    },
    { label: "ROS", actual: actuals.ros, plan: plan.ros, isMoney: false },
  ];

  return (
    <div className="rounded border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-gda-bg-base text-[11px] text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Metric</th>
            <th className="px-3 py-2 text-right font-medium">Actual</th>
            <th className="px-3 py-2 text-right font-medium">Plan</th>
            <th className="px-3 py-2 text-right font-medium">Variance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const variance = pctVar(r.actual, r.plan);
            return (
              <tr
                key={r.label}
                className="border-b border-border hover:bg-gda-panel/50"
              >
                <td className="px-3 py-2 text-left text-foreground">
                  {r.label}
                </td>
                <td className="px-3 py-2 text-right text-foreground tabular-nums">
                  {r.isMoney
                    ? formatMoney(r.actual)
                    : `${r.actual.toFixed(1)}%`}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                  {r.isMoney
                    ? formatMoney(r.plan)
                    : `${r.plan.toFixed(1)}%`}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right tabular-nums",
                    variance === null
                      ? "text-muted-foreground"
                      : variance >= 0
                        ? "text-gda-green-muted"
                        : "text-gda-red",
                  )}
                >
                  {variance !== null
                    ? `${variance >= 0 ? "+" : ""}${variance.toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
