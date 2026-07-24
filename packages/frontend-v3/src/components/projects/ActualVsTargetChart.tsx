"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts } from "@/lib/echarts-setup";
import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";

const TEAL = "var(--color-fin-teal)";
const STONE = "var(--color-fin-stone)";
const INK = "var(--color-fin-ink)";
const SAND = "var(--color-fin-sand)";

const CATEGORIES = ["Costs", "Profit", "Revenue"];

export function ActualVsTargetChart({ project }: { project: ProjectFullRow }) {
  const periodActuals = [
    project.actual_period_costs,
    project.actual_period_profit,
    project.actual_period_revenue,
  ];
  const periodTargets: Array<number | null> = [
    project.target_period_costs,
    project.target_period_profit,
    project.target_period_revenue,
  ];
  const ytdActuals = [
    project.actual_ytd_costs,
    project.actual_ytd_profit,
    project.actual_ytd_revenue,
  ];
  const ytdTargets: Array<number | null> = [
    project.target_ytd_costs,
    project.target_ytd_profit,
    project.target_ytd_revenue,
  ];

  const hasActuals = [...periodActuals, ...ytdActuals].some((v) => v !== 0);
  // Target/plan figures are not in the authoritative per-contract book — the API
  // returns null. Only draw the Target series when a real target exists (never a
  // fabricated 0), and label the chart Actual-only otherwise.
  const hasTargets = [...periodTargets, ...ytdTargets].some(
    (v) => v != null && v !== 0,
  );

  if (!hasActuals) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">
          No actual data for this period yet
        </p>
      </div>
    );
  }

  const xLabels = [
    "Period\nCosts",
    "Period\nProfit",
    "Period\nRevenue",
    "YTD\nCosts",
    "YTD\nProfit",
    "YTD\nRevenue",
  ];

  const actualData = [...periodActuals, ...ytdActuals];
  const targetData = [...periodTargets, ...ytdTargets];

  const series: Record<string, unknown>[] = [
    {
      name: "Actual",
      type: "bar",
      data: actualData,
      itemStyle: { color: TEAL, borderRadius: [2, 2, 0, 0] },
      barGap: "15%",
      barMaxWidth: 28,
      label: {
        show: true,
        position: "top",
        formatter: (p: { value: number }) => formatMoney(p.value),
        color: INK,
        fontSize: 12,
      },
    },
  ];
  if (hasTargets) {
    series.push({
      name: "Target",
      type: "bar",
      data: targetData,
      itemStyle: { color: STONE, borderRadius: [2, 2, 0, 0], opacity: 0.5 },
      barMaxWidth: 28,
      label: {
        show: true,
        position: "top",
        formatter: (p: { value: number | null }) =>
          p.value != null ? formatMoney(p.value) : "",
        color: STONE,
        fontSize: 12,
      },
    });
  }

  const option: Record<string, unknown> = {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (
        params: Array<{
          seriesName: string;
          value: number | null;
          marker: string;
          dataIndex: number;
        }>,
      ) => {
        if (!params.length) return "";
        const idx = params[0].dataIndex;
        const cluster = idx < 3 ? "Period" : "YTD";
        const metric = CATEGORIES[idx % 3];
        const lines = params
          .filter((p) => p.value != null && p.value !== 0)
          .map((p) => `${p.marker} ${p.seriesName}: ${formatMoney(p.value as number)}`);
        return `<strong>${cluster} ${metric}</strong><br/>${lines.join("<br/>")}`;
      },
    },
    legend: {
      data: hasTargets ? ["Actual", "Target"] : ["Actual"],
      bottom: 0,
      textStyle: { color: STONE, fontSize: 12 },
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 20,
    },
    grid: {
      left: 60,
      right: 16,
      top: 12,
      bottom: 40,
    },
    xAxis: {
      type: "category",
      data: xLabels,
      axisLabel: {
        color: STONE,
        fontSize: 12,
        interval: 0,
        lineHeight: 14,
      },
      axisLine: { lineStyle: { color: SAND } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: STONE,
        fontSize: 12,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: SAND, type: "dashed" } },
      axisLine: { show: false },
    },
    series,
  };

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-fin-ink">
        {hasTargets ? "Actual vs Target" : "Actual"}
      </h3>
      <p className="mb-3 text-[12px] text-muted-foreground">
        {hasTargets
          ? "Period and YTD comparison across costs, profit, and revenue"
          : "Period and YTD actuals across costs, profit, and revenue — target/plan not available in the source book"}
      </p>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 300 }}
        notMerge
      />
    </div>
  );
}
