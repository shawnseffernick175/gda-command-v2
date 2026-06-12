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
  { key: "cash" as const, label: "Cash", color: "#01696F" },
  {
    key: "accounts_receivable" as const,
    label: "Accounts Receivable",
    color: "#7A7974",
  },
  { key: "total_assets" as const, label: "Total Assets", color: "#28251D" },
];

export function BalanceSheetTrendChart() {
  const { data, isLoading } = useBalanceSheet();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-gda-panel" />;
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
      textStyle: { color: "#7A7974", fontSize: 11 },
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
      axisLabel: { color: "#7A7974", fontSize: 11 },
      axisLine: { lineStyle: { color: "#D4D1CA" } },
    },
    yAxis: {
      type: "value" as const,
      axisLabel: {
        color: "#7A7974",
        fontSize: 11,
        formatter: (v: number) => formatMoney(v),
      },
      splitLine: { lineStyle: { color: "#D4D1CA", type: "dashed" as const } },
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
