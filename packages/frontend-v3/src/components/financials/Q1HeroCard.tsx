"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SourceChip } from "@/components/shared/source-chip";
import { formatMoney } from "@/lib/format-money";
import type { KpiHeaderData } from "@/lib/types";

export function Q1HeroCard({ data }: { data: KpiHeaderData }) {
  const period = data.period ?? "FY26 Q1";

  return (
    <Card className="border-l-4 border-l-gda-cyan border-border bg-gda-panel">
      <CardContent className="py-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {period} Results
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Envision quarterly financial summary
            </p>
          </div>
          <SourceChip label="Financial Bible" kind="real" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
          <MetricCell
            label="Sales"
            value={formatMoney(data.sales.value)}
            plan={data.sales.plan !== null ? formatMoney(data.sales.plan) : null}
            delta={data.sales.delta}
          />
          <MetricCell
            label="EBIT"
            value={formatMoney(data.ebit.value)}
            plan={data.ebit.plan !== null ? formatMoney(data.ebit.plan) : null}
            delta={data.ebit.delta}
          />
          {data.gross_margin && (
            <MetricCell
              label="Gross Margin"
              value={`${data.gross_margin.value.toFixed(1)}%`}
              plan={data.gross_margin.plan !== null ? `${data.gross_margin.plan.toFixed(1)}%` : null}
              delta={data.gross_margin.delta}
            />
          )}
          <MetricCell
            label="ROS"
            value={`${data.ros.value.toFixed(1)}%`}
            plan={data.ros.plan !== null ? `${data.ros.plan.toFixed(1)}%` : null}
            delta={data.ros.delta}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCell({
  label,
  value,
  plan,
  delta,
}: {
  label: string;
  value: string;
  plan: string | null;
  delta: number | null;
}) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className="text-base font-bold text-foreground tabular-nums">
        {value}
      </p>
      <div className="flex items-center gap-1.5 text-[12px]">
        {plan !== null && (
          <span className="text-muted-foreground">Plan: {plan}</span>
        )}
        {delta !== null && (
          <span
            className={delta >= 0 ? "text-gda-green-muted" : "text-gda-red"}
          >
            {delta >= 0 ? "▲" : "▼"}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
