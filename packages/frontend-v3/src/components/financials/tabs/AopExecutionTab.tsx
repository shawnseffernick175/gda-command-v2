"use client";

import { useAopExecution } from "@/hooks/use-financial-bible";
import { NumberCell } from "@/components/financials/primitives/NumberCell";
import { SourceFooter } from "@/components/financials/SourceFooter";

export function AopExecutionTab({ fy }: { fy: string }) {
  const { data, isLoading, error } = useAopExecution(fy);

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading {fy} AOP execution data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-gda-red">
        Failed to load AOP execution data: {error.message}
      </div>
    );
  }

  const metrics = data?.metrics ?? (data?.revenue ? [data.revenue] : []);
  const hasPlan = data?.has_plan ?? false;
  const hasMetrics = hasPlan && metrics.length > 0 && metrics.some((m) => m.months.length > 0);
  const hasCostItems = !!data && data.items.length > 0;

  if (!data || (!hasPlan && !hasCostItems)) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No annual plan entered for {fy} yet. Enter your board-approved annual
          targets on the{" "}
          <span className="font-medium text-foreground">AOP Plan</span> tab to
          see the 12-month plan vs actual view here.
        </p>
      </div>
    );
  }

  const fmt = (v: number | null, kind: "currency" | "percent") => {
    if (v === null) return "\u2014";
    if (kind === "percent")
      return `${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
    return v.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  };
  // Favorable=green, unfavorable=red. For these metrics higher actual is better,
  // so positive variance = green, negative = red (industry standard).
  const varClass = (v: number | null, favorable: "higher" | "lower") => {
    if (v === null) return "text-muted-foreground";
    const good = favorable === "higher" ? v > 0 : v < 0;
    const bad = favorable === "higher" ? v < 0 : v > 0;
    if (good) return "text-gda-green-muted";
    if (bad) return "text-gda-red";
    return "text-foreground";
  };
  const shortMonth = (period: string) => period.replace(/^FY\d+\s*/, "");

  // Group by cost_element
  const byElement = new Map<string, typeof data.items>();
  for (const item of data.items) {
    const group = byElement.get(item.cost_element) ?? [];
    group.push(item);
    byElement.set(item.cost_element, group);
  }

  // Compute totals per cost_element across all periods
  const elementTotals = Array.from(byElement.entries()).map(
    ([element, items]) => {
      const totalPlanned = items.reduce((s, i) => s + i.planned, 0);
      const totalActual = items.reduce((s, i) => s + i.actual, 0);
      const totalVariance = items.reduce((s, i) => s + i.variance, 0);
      return { element, totalPlanned, totalActual, totalVariance, items };
    },
  );

  // Grand totals
  const grandPlanned = elementTotals.reduce((s, e) => s + e.totalPlanned, 0);
  const grandActual = elementTotals.reduce((s, e) => s + e.totalActual, 0);
  const grandVariance = elementTotals.reduce(
    (s, e) => s + e.totalVariance,
    0,
  );
  const gapPercent =
    grandPlanned !== 0
      ? ((grandVariance / grandPlanned) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      {hasMetrics && (
        <div className="space-y-6">
          <h2 className="text-sm font-semibold text-foreground">
            AOP Plan vs Actual {"\u2014"} {fy}
          </h2>
          {metrics.map((metric) => (
            <div key={metric.key} className="space-y-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[13px] font-semibold text-foreground">
                  {metric.label}
                </h3>
                <span className="text-[12px] text-muted-foreground">
                  FY Plan {fmt(metric.plan_total, metric.kind)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 text-left font-medium">
                        {"\u2014"}
                      </th>
                      {metric.months.map((m) => (
                        <th
                          key={m.period}
                          className="py-2 px-3 text-right font-medium"
                        >
                          {shortMonth(m.period)}
                        </th>
                      ))}
                      <th className="py-2 pl-3 text-right font-semibold text-foreground">
                        FY {metric.kind === "percent" ? "Avg" : "Total"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        Plan
                      </td>
                      {metric.months.map((m) => (
                        <td
                          key={m.period}
                          className="py-2 px-3 text-right tabular-nums"
                        >
                          {fmt(m.plan, metric.kind)}
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                        {fmt(metric.plan_total, metric.kind)}
                      </td>
                    </tr>
                    <tr className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium text-foreground">
                        Actual
                      </td>
                      {metric.months.map((m) => (
                        <td
                          key={m.period}
                          className="py-2 px-3 text-right tabular-nums"
                        >
                          {fmt(m.actual, metric.kind)}
                        </td>
                      ))}
                      <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                        {fmt(metric.actual_total, metric.kind)}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="py-2 pr-4 text-foreground">Variance</td>
                      {metric.months.map((m) => (
                        <td
                          key={m.period}
                          className={`py-2 px-3 text-right tabular-nums ${varClass(m.variance, metric.favorable)}`}
                        >
                          {m.variance !== null && m.variance > 0 ? "+" : ""}
                          {fmt(m.variance, metric.kind)}
                        </td>
                      ))}
                      <td
                        className={`py-2 pl-3 text-right tabular-nums ${varClass(metric.variance_total, metric.favorable)}`}
                      >
                        {metric.variance_total !== null &&
                        metric.variance_total > 0
                          ? "+"
                          : ""}
                        {fmt(metric.variance_total, metric.kind)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground italic">
            Actual above plan is favorable (green). Dollar lines (Orders, Sales,
            EBIT) come from your annual AOP plan divided flat monthly (annual
            {" \u00f7 "}12); percentage lines (GM, ROS) apply the same plan value
            each month. Blank months await actuals.
          </p>
        </div>
      )}

      {hasCostItems && (
      <div className="space-y-4">
      <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
        <span>
          Periods loaded: {data.periods.join(", ")}
        </span>
        <span>
          Gap to plan:{" "}
          {gapPercent !== null ? (
            <span
              className={
                Number(gapPercent) > 0
                  ? "text-gda-red"
                  : "text-gda-green-muted"
              }
            >
              {Number(gapPercent) > 0 ? "+" : ""}
              {gapPercent}%
            </span>
          ) : (
            <span>{"\u2014"}</span>
          )}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-4 text-left font-medium">
                Cost Element / Pool
              </th>
              <th className="py-2 pr-4 text-right font-medium">Planned</th>
              <th className="py-2 pr-4 text-right font-medium">Actual</th>
              <th className="py-2 text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody>
            {elementTotals.map((et) => (
              <tr
                key={et.element}
                className="border-b border-border/50"
              >
                <td className="py-2 pr-4 font-medium text-foreground">
                  {et.element}
                </td>
                <td className="py-2 pr-4 text-right">
                  <NumberCell value={et.totalPlanned} format="money" />
                </td>
                <td className="py-2 pr-4 text-right">
                  <NumberCell value={et.totalActual} format="money" />
                </td>
                <td className="py-2 text-right">
                  <NumberCell
                    value={et.totalVariance}
                    format="money"
                    className={
                      et.totalVariance > 0
                        ? "text-gda-red"
                        : et.totalVariance < 0
                          ? "text-gda-green-muted"
                          : undefined
                    }
                  />
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-border font-semibold">
              <td className="py-2 pr-4 text-foreground">Total</td>
              <td className="py-2 pr-4 text-right">
                <NumberCell value={grandPlanned} format="money" />
              </td>
              <td className="py-2 pr-4 text-right">
                <NumberCell value={grandActual} format="money" />
              </td>
              <td className="py-2 text-right">
                <NumberCell
                  value={grandVariance}
                  format="money"
                  className={
                    grandVariance > 0
                      ? "text-gda-red"
                      : grandVariance < 0
                        ? "text-gda-green-muted"
                        : undefined
                  }
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[11px] text-muted-foreground italic">
        Risk/Opportunity adjustments not yet available. Future update will add
        per-contract R/O overrides.
      </div>

      <SourceFooter meta={data.meta} />
      </div>
      )}
    </div>
  );
}
