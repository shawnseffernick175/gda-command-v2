"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { GaugeChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ProjectFullRow } from "@/lib/types";
import { cn } from "@/lib/utils";

echarts.use([GaugeChart, TooltipComponent, CanvasRenderer]);

function safeMargin(profit: number, revenue: number): number | null {
  if (revenue === 0) return null;
  return (profit / revenue) * 100;
}

export function ProfitMarginCard({ project }: { project: ProjectFullRow }) {
  const periodMargin = safeMargin(
    project.actual_period_profit,
    project.actual_period_revenue,
  );
  const ytdMargin = safeMargin(
    project.actual_ytd_profit,
    project.actual_ytd_revenue,
  );
  const targetPeriodMargin = safeMargin(
    project.target_period_profit,
    project.target_period_revenue,
  );
  const targetYtdMargin = safeMargin(
    project.target_ytd_profit,
    project.target_ytd_revenue,
  );

  const hasData = periodMargin != null || ytdMargin != null;

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">No margin data for this period yet</p>
      </div>
    );
  }

  const gaugeValue = periodMargin ?? ytdMargin ?? 0;
  const gaugeMax = Math.max(gaugeValue * 1.5, 50);

  const option: Record<string, unknown> = {
    tooltip: { show: false },
    series: [
      {
        type: "gauge",
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: gaugeMax,
        radius: "90%",
        pointer: { show: false },
        progress: {
          show: true,
          width: 14,
          roundCap: true,
          itemStyle: { color: "var(--color-fin-teal)" },
        },
        axisLine: {
          lineStyle: { width: 14, color: [[1, "var(--color-fin-sand)"]] },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          formatter: (v: number) => `${v.toFixed(1)}%`,
          fontSize: 22,
          fontWeight: 600,
          color: "var(--color-fin-ink)",
          offsetCenter: [0, "20%"],
        },
        title: {
          show: true,
          offsetCenter: [0, "50%"],
          fontSize: 11,
          color: "var(--color-fin-stone)",
        },
        data: [{ value: gaugeValue, name: "Period Margin" }],
        ...(targetPeriodMargin != null
          ? {
              markLine: {
                data: [{ yAxis: targetPeriodMargin }],
              },
            }
          : {}),
      },
    ],
  };

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-fin-ink">
        Profit Margin
      </h3>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 200 }}
        notMerge
      />
      <div className="mt-2 grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Period
          </p>
          <p className="text-lg font-semibold text-foreground">
            {periodMargin != null ? `${periodMargin.toFixed(1)}%` : "\u2014"}
          </p>
          {targetPeriodMargin != null && (
            <p
              className={cn(
                "text-[11px]",
                periodMargin != null && periodMargin >= targetPeriodMargin
                  ? "text-gda-green"
                  : "text-gda-red",
              )}
            >
              Target: {targetPeriodMargin.toFixed(1)}%
            </p>
          )}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            YTD
          </p>
          <p className="text-lg font-semibold text-foreground">
            {ytdMargin != null ? `${ytdMargin.toFixed(1)}%` : "\u2014"}
          </p>
          {targetYtdMargin != null && (
            <p
              className={cn(
                "text-[11px]",
                ytdMargin != null && ytdMargin >= targetYtdMargin
                  ? "text-gda-green"
                  : "text-gda-red",
              )}
            >
              Target: {targetYtdMargin.toFixed(1)}%
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
