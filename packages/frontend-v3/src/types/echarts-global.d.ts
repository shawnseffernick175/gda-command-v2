/* Global type for CDN-loaded ECharts (loaded via <Script> in layout.tsx) */
interface EChartsInstance {
  setOption(option: Record<string, unknown>, notMerge?: boolean, lazyUpdate?: boolean): void;
  resize(): void;
  dispose(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler?: (...args: unknown[]) => void): void;
}

interface EChartsGlobal {
  init(container: HTMLElement, theme?: string | null, opts?: { renderer?: "canvas" | "svg" }): EChartsInstance;
  getInstanceByDom(container: HTMLElement): EChartsInstance | undefined;
}

interface Window {
  echarts: EChartsGlobal;
}
