/**
 * Type override for echarts-for-react — class component types are incompatible
 * with React 19 JSX element types. This declaration makes the component usable
 * as JSX without type errors.
 */
declare module "echarts-for-react/lib/core" {
  import type { CSSProperties } from "react";
  import type { ECharts } from "echarts";

  export interface EChartsReactProps {
    echarts?: unknown;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    option: any;
    theme?: string | object;
    notMerge?: boolean;
    lazyUpdate?: boolean;
    loading?: boolean;
    loadingOption?: object;
    showLoading?: boolean;
    onEvents?: Record<string, (params: unknown, instance: ECharts) => void>;
    onChartReady?: (instance: ECharts) => void;
    opts?: {
      devicePixelRatio?: number;
      renderer?: "canvas" | "svg";
      width?: number | "auto";
      height?: number | "auto";
    };
    style?: CSSProperties;
    className?: string;
  }

  const ReactEChartsCore: React.FC<EChartsReactProps>;
  export default ReactEChartsCore;
}
