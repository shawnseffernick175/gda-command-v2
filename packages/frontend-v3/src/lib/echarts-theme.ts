// VISUAL_GUARDRAIL_IGNORE — raw hex values are token references for ECharts theme registration
import * as echarts from 'echarts';

const sharedTextStyle = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: 400 as const,
  fontSize: 12,
};

export const gdaDarkTheme: Record<string, unknown> = {
  backgroundColor: 'transparent',
  textStyle: sharedTextStyle,
  animation: true,
  animationDuration: 120,
  animationEasing: 'cubicOut',
  animationDurationUpdate: 0,
  color: [
    '#01696F', // accent
    '#3FA66B', // success
    '#C48A1E', // warning
    '#A12C7B', // critical
    '#6B7079', // ink-dim
    '#9AA0A8', // ink-muted
    '#E6E8EB', // ink-primary
  ],
  categoryAxis: {
    axisLine: { lineStyle: { color: '#2A2F36' } },
    axisTick: { lineStyle: { color: '#2A2F36' } },
    axisLabel: { color: '#9AA0A8', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11 },
    splitLine: { lineStyle: { color: '#2A2F36', opacity: 0.5, type: 'solid' } },
    nameTextStyle: { color: '#9AA0A8', fontSize: 11 },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#2A2F36' } },
    axisTick: { lineStyle: { color: '#2A2F36' } },
    axisLabel: { color: '#9AA0A8', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11 },
    splitLine: { lineStyle: { color: '#2A2F36', opacity: 0.5, type: 'solid' } },
    nameTextStyle: { color: '#9AA0A8', fontSize: 11 },
  },
  tooltip: {
    backgroundColor: '#1A1E23',
    borderColor: '#3D434C',
    borderWidth: 1,
    textStyle: { color: '#E6E8EB', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12 },
    padding: [8, 12],
    extraCssText: 'border-radius: 6px;',
  },
  legend: {
    textStyle: { color: '#9AA0A8', fontSize: 11 },
    right: 0,
    top: 0,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 16,
    inactiveColor: '#6B7079',
  },
  line: {
    lineStyle: { width: 2 },
    symbolSize: 4,
    symbol: 'circle',
    smooth: false,
    itemStyle: { borderWidth: 0 },
  },
  bar: {
    barMaxWidth: 32,
    itemStyle: { borderRadius: [2, 2, 0, 0] },
  },
  pie: {
    itemStyle: { borderColor: '#13161A', borderWidth: 2 },
    label: { color: '#E6E8EB', fontSize: 11 },
  },
  funnel: {
    itemStyle: { borderColor: '#13161A', borderWidth: 1 },
    label: { color: '#E6E8EB', fontSize: 11, position: 'inside' },
  },
  markLine: {
    lineStyle: { color: '#3D434C', type: 'dashed', width: 1 },
    label: { color: '#9AA0A8', fontSize: 11, fontFamily: "'Inter', system-ui, sans-serif" },
  },
};

export const gdaLightTheme: Record<string, unknown> = {
  ...Object.fromEntries(Object.entries(gdaDarkTheme)),
  categoryAxis: {
    axisLine: { lineStyle: { color: '#D4D1CA' } },
    axisTick: { lineStyle: { color: '#D4D1CA' } },
    axisLabel: { color: '#7A7974', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11 },
    splitLine: { lineStyle: { color: '#D4D1CA', opacity: 0.5, type: 'solid' } },
    nameTextStyle: { color: '#7A7974', fontSize: 11 },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#D4D1CA' } },
    axisTick: { lineStyle: { color: '#D4D1CA' } },
    axisLabel: { color: '#7A7974', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11 },
    splitLine: { lineStyle: { color: '#D4D1CA', opacity: 0.5, type: 'solid' } },
    nameTextStyle: { color: '#7A7974', fontSize: 11 },
  },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B8B5AE',
    borderWidth: 1,
    textStyle: { color: '#28251D', fontFamily: "'Inter', system-ui, sans-serif", fontSize: 12 },
    padding: [8, 12],
    extraCssText: 'border-radius: 6px;',
  },
  legend: {
    right: 0,
    top: 0,
    itemWidth: 12,
    itemHeight: 12,
    itemGap: 16,
    textStyle: { color: '#7A7974', fontSize: 11 },
    inactiveColor: '#A3A09A',
  },
  pie: {
    itemStyle: { borderColor: '#FFFFFF', borderWidth: 2 },
    label: { color: '#28251D', fontSize: 11 },
  },
  funnel: {
    itemStyle: { borderColor: '#FFFFFF', borderWidth: 1 },
    label: { color: '#28251D', fontSize: 11, position: 'inside' },
  },
};

export function registerGdaThemes() {
  echarts.registerTheme('gda-dark', gdaDarkTheme);
  echarts.registerTheme('gda-light', gdaLightTheme);
}
