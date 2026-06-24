"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export function MonthlyRevenueTrend({ items }: { items: ProjectFullRow[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">No monthly trend data yet</p>
      </div>
    );
  }

  const periods = items.map((r) => r.period);
  const actuals = items.map((r) => r.actual_period_revenue ?? null);
  const targets = items.map((r) =>
    r.target_period_revenue > 0 ? r.target_period_revenue : null,
  );

  const option: Record<string, unknown> = {
    tooltip: {
      trigger: "axis",
      formatter: (params: Array<{ seriesName: string; value: number | null; marker: string }>) =>
        params
          .filter((p) => p.value != null)
          .map((p) => `${p.marker} ${p.seriesName}: ${formatMoney(p.value)}`)
          .join("<br/>"),
    },
    legend: {
      data: ["Actual Revenue", "Target"],
      bottom: 0,
      textStyle: { color: "var(--color-fin-stone)", fontSize: 11 },
    },
    grid: { left: 64, right: 16, top: 16, bottom: 40 },
    xAxis: {
      type: "category",
      data: periods,
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 11 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: "var(--color-fin-stone)",
        fontSize: 11,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    series: [
      {
        name: "Actual Revenue",
        type: "line",
        data: actuals,
        connectNulls: false,
        lineStyle: { width: 2.5, color: "var(--color-fin-teal)" },
        itemStyle: { color: "var(--color-fin-teal)" },
        symbol: "circle",
        symbolSize: 7,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: "rgba(1, 105, 111, 0.18)" },
            { offset: 1, color: "rgba(1, 105, 111, 0.02)" },
          ]),
        },
      },
      {
        name: "Target",
        type: "line",
        data: targets,
        connectNulls: false,
        lineStyle: { width: 1.5, type: "dashed", color: "var(--color-fin-stone)" },
        itemStyle: { color: "var(--color-fin-stone)" },
        symbol: "diamond",
        symbolSize: 5,
      },
    ],
  };

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-fin-ink">
        Monthly Revenue Trend
      </h3>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 260 }}
        notMerge
      />
    </div>
  );
}
