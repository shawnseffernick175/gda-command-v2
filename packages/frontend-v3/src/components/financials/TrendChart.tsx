"use client";

import ReactEChartsCore from "echarts-for-react/lib/core";
import { echarts } from "@/lib/echarts-setup";
import { useFinancialsTrend } from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import {
  axisCommon,
  tooltipDefaults,
  legendDefaults,
  gdaDarkTheme,
} from "@/lib/echarts-theme";

export function TrendChart() {
  const { data, isLoading } = useFinancialsTrend();

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-gda-panel" />;
  }

  if (!data?.items.length) {
    return <p className="text-xs text-muted-foreground">No trend data yet</p>;
  }

  const palette = gdaDarkTheme.color as string[];

  const option = {
    tooltip: {
      ...tooltipDefaults,
      trigger: "axis" as const,
      valueFormatter: (v: number) => formatMoney(v),
    },
    legend: { ...legendDefaults },
    xAxis: {
      type: "category" as const,
      data: data.items.map((d) => d.period),
      ...axisCommon,
    },
    yAxis: {
      type: "value" as const,
      ...axisCommon,
      axisLabel: {
        ...axisCommon.axisLabel,
        formatter: (v: number) => formatMoney(v),
      },
    },
    series: [
      {
        name: "Orders",
        type: "line" as const,
        data: data.items.map((d) => d.orders),
        lineStyle: { width: 2 },
        symbolSize: 4,
        symbol: "circle",
        smooth: false,
        itemStyle: { borderWidth: 0, color: palette[0] },
      },
      {
        name: "Sales",
        type: "line" as const,
        data: data.items.map((d) => d.sales),
        lineStyle: { width: 2 },
        symbolSize: 4,
        symbol: "circle",
        smooth: false,
        itemStyle: { borderWidth: 0, color: palette[1] },
      },
      {
        name: "EBIT",
        type: "line" as const,
        data: data.items.map((d) => d.ebit),
        lineStyle: { width: 2 },
        symbolSize: 4,
        symbol: "circle",
        smooth: false,
        itemStyle: { borderWidth: 0, color: palette[2] },
      },
    ],
    grid: { left: 60, right: 16, top: 32, bottom: 24 },
  };

  return (
    <div className="w-full h-64">
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: "100%", width: "100%" }}
      />
    </div>
  );
}
