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

  if (!data || data.items.length === 0) {
    return (
      <div className="rounded border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No AOP execution data for {fy}. Upload cost detail (TGT vs ACT)
          financial documents via Vault to populate this tab.
        </p>
      </div>
    );
  }

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
            <span>&mdash;</span>
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
  );
}
