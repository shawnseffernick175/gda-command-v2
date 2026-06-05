// ECharts theme per D2 Design System §6 — hex values are token references
// VISUAL_GUARDRAIL_IGNORE

import type { EChartsOption } from "echarts";

export const gdaDarkTheme: EChartsOption = {
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 400,
    fontSize: 12,
  },
  animation: true,
  animationDuration: 120,
  animationEasing: "cubicOut",
  animationDurationUpdate: 0,
  color: [
    "#01696F",
    "#3FA66B",
    "#C48A1E",
    "#A12C7B",
    "#6B7079",
    "#9AA0A8",
    "#E6E8EB",
  ],
};

export const axisCommon = {
  axisLine: { lineStyle: { color: "#2A2F36" } },
  axisTick: { lineStyle: { color: "#2A2F36" } },
  axisLabel: {
    color: "#9AA0A8",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 11,
  },
  splitLine: {
    lineStyle: { color: "#2A2F36", opacity: 0.5, type: "solid" as const },
  },
  nameTextStyle: { color: "#9AA0A8", fontSize: 11 },
};

export const tooltipDefaults = {
  backgroundColor: "#1A1E23",
  borderColor: "#3D434C",
  borderWidth: 1,
  textStyle: {
    color: "#E6E8EB",
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 12,
  },
  padding: [8, 12],
  extraCssText: "border-radius: 6px;",
};

export const legendDefaults = {
  textStyle: { color: "#9AA0A8", fontSize: 11 },
  right: 0,
  top: 0,
  itemWidth: 12,
  itemHeight: 12,
  itemGap: 16,
  inactiveColor: "#6B7079",
};
