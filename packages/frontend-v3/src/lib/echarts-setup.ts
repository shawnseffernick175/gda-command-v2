/**
 * Shared ECharts setup — registers all required components once.
 * Import `echarts` and `ReactEChartsCore` from here instead of
 * repeating the registration boilerplate in every chart component.
 */
import ReactEChartsCore from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  SVGRenderer,
]);

export { echarts, ReactEChartsCore };
