"use client";

import ReactEChartsCore from "echarts-for-react";
import { useFinancialsForecast } from "@/hooks/use-financials";
import { formatMoney } from "@/lib/format-money";
import {
  axisCommon,
  tooltipDefaults,
  legendDefaults,
  gdaDarkTheme,
} from "@/lib/echarts-theme";

export function ForecastChart() {
  const { data, isLoading } = useFinancialsForecast();

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded bg-gda-panel" />;
  }

  if (!data?.items.length) {
    return <p className="text-xs text-muted-foreground">No forecast data yet</p>;
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
        name: "Actual Orders",
        type: "bar" as const,
        data: data.items.map((d) => d.actual_orders),
        barMaxWidth: 32,
        itemStyle: { borderRadius: [2, 2, 0, 0], color: palette[0] },
      },
      {
        name: "Plan Orders",
        type: "bar" as const,
        data: data.items.map((d) => d.plan_orders),
        barMaxWidth: 32,
        itemStyle: { borderRadius: [2, 2, 0, 0], color: palette[4] },
      },
    ],
    grid: { left: 60, right: 16, top: 32, bottom: 24 },
  };

  return (
    <div className="w-full h-64">
      <ReactEChartsCore option={option} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
