import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { SourceKindContributionData } from '../types';
import { SourceUrlChip } from '../components/SourceUrlChip/SourceUrlChip';
import { EmptyState } from '../components/EmptyState/EmptyState';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface Props {
  data: SourceKindContributionData;
}

export function SourceKindContributionChart({ data }: Props) {
  if (data.periods.length === 0) {
    return <EmptyState title="No source data for the selected period." />;
  }

  const allKinds = new Set<string>();
  data.periods.forEach((p) => p.sources.forEach((s) => allKinds.add(s.kind)));
  const kinds = Array.from(allKinds);

  const series = kinds.map((kind) => ({
    name: kind,
    type: 'bar' as const,
    stack: 'total',
    data: data.periods.map((p) => p.sources.find((s) => s.kind === kind)?.count ?? 0),
  }));

  const option: echarts.EChartsCoreOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: kinds },
    xAxis: { type: 'category', data: data.periods.map((p) => p.label) },
    yAxis: { type: 'value', name: 'Opportunities' },
    series,
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-ink-primary mb-4">Source-Kind Contribution — Last {data.periods.length} Months</h3>
      <ReactEChartsCore echarts={echarts} option={option} theme="gda-dark" style={{ height: 320 }} />
      {data.sourceRefs.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {data.sourceRefs.map((src, i) => (
            <SourceUrlChip key={i} url={src.url} source_kind={src.kind} retrieved_at={new Date().toISOString()} data-testid={`data-point-source-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}
