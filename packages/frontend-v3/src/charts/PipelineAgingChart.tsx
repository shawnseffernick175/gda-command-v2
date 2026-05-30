import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { PipelineAgingData } from '../types';
import { SourceUrlChip } from '../components/SourceUrlChip/SourceUrlChip';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { darkColors } from '../lib/tokens';

echarts.use([BarChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer]);

interface Props {
  data: PipelineAgingData;
}

export function PipelineAgingChart({ data }: Props) {
  if (data.items.length === 0) {
    return <EmptyState title="No active pipeline items." />;
  }

  const meanThreshold = data.items.reduce((s, i) => s + i.threshold, 0) / data.items.length;

  const option: echarts.EChartsCoreOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { name: string; value: number }[];
        const item = data.items.find((i) => i.title.slice(0, 40) === items[0].name);
        if (!item) return '';
        return `${item.title} — Stage ${item.stage}: ${item.daysInStage} days (threshold: ${item.threshold}d) — est. $${(item.value / 1e6).toFixed(1)}M`;
      },
    },
    grid: { left: 200 },
    yAxis: {
      type: 'category',
      data: data.items.map((i) => i.title.slice(0, 40)),
      inverse: true,
    },
    xAxis: { type: 'value', name: 'Days in Stage' },
    series: [
      {
        type: 'bar',
        data: data.items.map((item) => ({
          value: item.daysInStage,
          itemStyle: {
            color:
              item.daysInStage >= item.threshold
                ? darkColors.critical
                : item.daysInStage >= item.threshold * 0.8
                  ? darkColors.warning
                  : darkColors.accent,
          },
        })),
        markLine: {
          data: [{ xAxis: meanThreshold, name: 'Mean Threshold' }],
        },
      },
    ],
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-ink-primary mb-4">Pipeline Aging — {data.items.length} Active Pursuits</h3>
      <ReactEChartsCore echarts={echarts} option={option} theme="gda-dark" style={{ height: Math.max(300, data.items.length * 40) }} />
      {data.sourceRefs.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {data.sourceRefs.map((src, i) => (
            <SourceUrlChip key={i} url={src.url} source_kind={src.kind} retrieved_at={new Date().toISOString()} data-testid={`data-point-aging-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}
