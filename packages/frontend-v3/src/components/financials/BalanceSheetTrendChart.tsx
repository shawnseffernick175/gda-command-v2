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
import { useBalanceSheet } from "@/hooks/use-balance-sheet";
import { formatMoney } from "@/lib/format-money";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

const SERIES_CONFIG = [
  { key: "cash" as const, label: "Cash", color: "var(--color-fin-teal)" },
  {
    key: "accounts_receivable" as const,
    label: "Accounts Receivable",
    color: "var(--color-fin-stone)",
  },
  { key: "total_assets" as const, label: "Total Assets", color: "var(--color-fin-ink)" },
];

export function BalanceSheetTrendChart() {
  const { data, isLoading } = useBalanceSheet();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-skeleton" />;
  }

  const trend = data?.trend ?? [];

  if (trend.length < 2) {
    return null;
  }

  const periods = [...trend].reverse().map((r) => r.period);

  const series = SERIES_CONFIG.map((cfg) => ({
    name: cfg.label,
    type: "line" as const,
    data: [...trend].reverse().map((r) => r[cfg.key]),
    lineStyle: { width: 2 },
    itemStyle: { color: cfg.color },
    symbol: "circle",
    symbolSize: 6,
  }));

  const option = {
    tooltip: {
      trigger: "axis" as const,
      formatter: (params: Array<{ seriesName: string; value: number; marker: string }>) => {
        const lines = params.map(
          (p) => `${p.marker} ${p.seriesName}: ${formatMoney(p.value)}`,
        );
        return lines.join("<br/>");
      },
    },
    legend: {
      data: SERIES_CONFIG.map((c) => c.label),
      bottom: 0,
      textStyle: { color: "var(--color-fin-stone)", fontSize: 12 },
    },
    grid: {
      left: 60,
      right: 16,
      top: 8,
      bottom: 40,
    },
    xAxis: {
      type: "category" as const,
      data: periods,
      axisLabel: { color: "var(--color-fin-stone)", fontSize: 12 },
      axisLine: { lineStyle: { color: "var(--color-fin-sand)" } },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: "var(--color-fin-stone)",
        fontSize: 12,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: "var(--color-fin-sand)", type: "dashed" as const } },
    },
    series,
  };

  return (
    <div className="rounded border border-border bg-white p-4">
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: 240 }}
        notMerge
      />
    </div>
  );
}
