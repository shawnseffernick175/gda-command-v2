"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export function ActualVsTargetChart({ project }: { project: ProjectFullRow }) {
  const categories = [
    "Period Costs",
    "Period Profit",
    "Period Revenue",
    "YTD Costs",
    "YTD Profit",
    "YTD Revenue",
  ];

  const actuals = [
    project.actual_period_costs,
    project.actual_period_profit,
    project.actual_period_revenue,
    project.actual_ytd_costs,
    project.actual_ytd_profit,
    project.actual_ytd_revenue,
  ];

  const targets = [
    project.target_period_costs,
    project.target_period_profit,
    project.target_period_revenue,
    project.target_ytd_costs,
    project.target_ytd_profit,
    project.target_ytd_revenue,
  ];

  const hasData = actuals.some((v) => v !== 0) || targets.some((v) => v !== 0);
  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">No actual vs target data for this period yet</p>
      </div>
    );
  }

  const option: Record<string, unknown> = {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string }>) =>
        params
          .map((p) => `${p.marker} ${p.seriesName}: ${formatMoney(p.value)}`)
          .join("<br/>"),
    },
    legend: {
      data: ["Actual", "Target"],
      bottom: 0,
      textStyle: { color: "var(--color-fin-stone)", fontSize: 11 },
    },
    grid: { left: 64, right: 16, top: 16, bottom: 40 },
    xAxis: {
      type: "category",
      data: categories,
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 10, rotate: 20 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
      axisTick: { show: false },
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
        name: "Actual",
        type: "bar",
        data: actuals,
        barGap: "10%",
        itemStyle: { color: "var(--color-fin-teal)", borderRadius: [2, 2, 0, 0] },
        label: {
          show: true,
          position: "top",
          fontSize: 10,
          color: "var(--color-fin-stone)",
          formatter: (p: { value: number }) => formatMoney(p.value),
        },
      },
      {
        name: "Target",
        type: "bar",
        data: targets,
        itemStyle: { color: "var(--color-fin-sand)", borderRadius: [2, 2, 0, 0] },
        label: {
          show: true,
          position: "top",
          fontSize: 10,
          color: "var(--color-fin-stone)",
          formatter: (p: { value: number }) => formatMoney(p.value),
        },
      },
    ],
  };

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-3 text-sm font-medium text-fin-ink">
        Actual vs Target
      </h3>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 280 }}
        notMerge
      />
    </div>
  );
}
