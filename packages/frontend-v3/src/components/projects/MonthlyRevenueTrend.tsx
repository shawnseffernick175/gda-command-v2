"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts } from "@/lib/echarts-setup";
import type { ProjectFullRow } from "@/lib/types";
import { formatMoney } from "@/lib/format-money";

const TEAL = "var(--color-fin-teal)";
const STONE = "var(--color-fin-stone)";
const SAND = "var(--color-fin-sand)";
const INK = "var(--color-fin-ink)";

export function MonthlyRevenueTrend({ items }: { items: ProjectFullRow[] }) {
  if (items.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed border-border bg-gda-panel/30">
        <p className="text-sm text-muted-foreground">
          No monthly trend data yet
        </p>
      </div>
    );
  }

  const periods = items.map((r) => r.period);
  const shortLabels = periods.map((p) => p.replace(/^FY\d+\s*/, ""));
  const actuals = items.map((r) =>
    r.actual_period_revenue != null && r.actual_period_revenue !== 0
      ? r.actual_period_revenue
      : null,
  );
  const targets = items.map((r) =>
    r.target_period_revenue > 0 ? r.target_period_revenue : null,
  );

  const option: Record<string, unknown> = {
    tooltip: {
      trigger: "axis",
      formatter: (
        params: Array<{
          seriesName: string;
          value: number | null;
          marker: string;
          axisValue: string;
        }>,
      ) => {
        if (!params.length) return "";
        const idx = shortLabels.indexOf(params[0].axisValue);
        const fullPeriod = idx >= 0 ? periods[idx] : params[0].axisValue;
        const lines = params
          .filter((p) => p.value != null)
          .map(
            (p) => `${p.marker} ${p.seriesName}: ${formatMoney(p.value)}`,
          );
        return `<strong>${fullPeriod}</strong><br/>${lines.join("<br/>")}`;
      },
    },
    legend: {
      data: ["Actual Revenue", "Target"],
      bottom: 0,
      textStyle: { color: STONE, fontSize: 11 },
      itemWidth: 16,
      itemHeight: 2,
      itemGap: 20,
    },
    grid: {
      left: 60,
      right: 16,
      top: 16,
      bottom: 40,
    },
    xAxis: {
      type: "category",
      data: shortLabels,
      boundaryGap: false,
      axisLabel: {
        color: STONE,
        fontSize: 11,
        interval: 0,
      },
      axisLine: { lineStyle: { color: SAND } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: STONE,
        fontSize: 11,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: SAND, type: "dashed" } },
      axisLine: { show: false },
    },
    series: [
      {
        name: "Actual Revenue",
        type: "line",
        data: actuals,
        connectNulls: false,
        lineStyle: { width: 2.5, color: TEAL },
        itemStyle: { color: TEAL },
        symbol: "circle",
        symbolSize: 8,
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(1, 105, 111, 0.15)" },
              { offset: 1, color: "rgba(1, 105, 111, 0.02)" },
            ],
          },
        },
        label: {
          show: true,
          position: "top",
          formatter: (p: { value: number | null }) =>
            p.value != null ? formatMoney(p.value) : "",
          color: INK,
          fontSize: 10,
        },
      },
      {
        name: "Target",
        type: "line",
        data: targets,
        connectNulls: false,
        lineStyle: { width: 1.5, color: STONE, type: "dashed" },
        itemStyle: { color: STONE },
        symbol: "circle",
        symbolSize: 5,
      },
    ],
  };

  return (
    <div className="rounded border border-border bg-white p-4">
      <h3 className="mb-1 text-sm font-medium text-fin-ink">
        Monthly Revenue Trend
      </h3>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Actual period revenue vs target across months
      </p>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 280 }}
        notMerge
      />
    </div>
  );
}
