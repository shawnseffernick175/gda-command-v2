/* VISUAL_GUARDRAIL_IGNORE — raw hex values here are token references for ECharts theme registration */

import * as echarts from "echarts";

export const gdaDarkTheme = {
  backgroundColor: "transparent",
  textStyle: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight: 400,
    fontSize: 12,
  },
  animation: true,
  animationDuration: 120,
  animationEasing: "cubicOut" as const,
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
  categoryAxis: {
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
  },
  valueAxis: {
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
  },
  tooltip: {
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
  },
  legend: {
    textStyle: { color: "#9AA0A8", fontSize: 11 },
    right: 0,
    top: 0,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 16,
    inactiveColor: "#6B7079",
  },
  line: {
    lineStyle: { width: 2 },
    symbolSize: 4,
    symbol: "circle",
    smooth: false,
    itemStyle: { borderWidth: 0 },
  },
  bar: {
    barMaxWidth: 32,
    itemStyle: { borderRadius: [2, 2, 0, 0] },
  },
  pie: {
    itemStyle: { borderColor: "#13161A", borderWidth: 2 },
    label: { color: "#E6E8EB", fontSize: 11 },
  },
  funnel: {
    itemStyle: { borderColor: "#13161A", borderWidth: 1 },
    label: { color: "#E6E8EB", fontSize: 11, position: "inside" as const },
  },
  markLine: {
    lineStyle: { color: "#3D434C", type: "dashed" as const, width: 1 },
    label: {
      color: "#9AA0A8",
      fontSize: 11,
      fontFamily: "'Inter', system-ui, sans-serif",
    },
  },
};

export const gdaLightTheme = {
  ...gdaDarkTheme,
  categoryAxis: {
    ...gdaDarkTheme.categoryAxis,
    axisLine: { lineStyle: { color: "#D4D1CA" } },
    axisTick: { lineStyle: { color: "#D4D1CA" } },
    axisLabel: { ...gdaDarkTheme.categoryAxis.axisLabel, color: "#7A7974" },
    splitLine: { lineStyle: { color: "#D4D1CA", opacity: 0.5, type: "solid" as const } },
    nameTextStyle: { color: "#7A7974", fontSize: 11 },
  },
  valueAxis: {
    ...gdaDarkTheme.valueAxis,
    axisLine: { lineStyle: { color: "#D4D1CA" } },
    axisTick: { lineStyle: { color: "#D4D1CA" } },
    axisLabel: { ...gdaDarkTheme.valueAxis.axisLabel, color: "#7A7974" },
    splitLine: { lineStyle: { color: "#D4D1CA", opacity: 0.5, type: "solid" as const } },
    nameTextStyle: { color: "#7A7974", fontSize: 11 },
  },
  tooltip: {
    ...gdaDarkTheme.tooltip,
    backgroundColor: "#FFFFFF",
    borderColor: "#B8B5AE",
    textStyle: { ...gdaDarkTheme.tooltip.textStyle, color: "#28251D" },
  },
  legend: {
    ...gdaDarkTheme.legend,
    textStyle: { color: "#7A7974", fontSize: 11 },
    inactiveColor: "#A3A09A",
  },
  pie: {
    itemStyle: { borderColor: "#FFFFFF", borderWidth: 2 },
    label: { color: "#28251D", fontSize: 11 },
  },
  funnel: {
    itemStyle: { borderColor: "#FFFFFF", borderWidth: 1 },
    label: { color: "#28251D", fontSize: 11, position: "inside" as const },
  },
};

export function registerGdaThemes() {
  echarts.registerTheme("gda-dark", gdaDarkTheme);
  echarts.registerTheme("gda-light", gdaLightTheme);
}
