import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { FundingVelocityData } from '../types';
import { SourceUrlChip } from '../components/SourceUrlChip/SourceUrlChip';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { darkColors } from '../lib/tokens';

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

interface Props {
  data: FundingVelocityData;
}

export function FundingVelocityChart({ data }: Props) {
  if (data.periods.length === 0) {
    return <EmptyState title="No funding data available for selected NAICS codes." />;
  }

  const option: echarts.EChartsCoreOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const items = params as { name: string; seriesName: string; value: number }[];
        const cur = items.find((i) => i.seriesName === 'Current FY')?.value ?? 0;
        const prev = items.find((i) => i.seriesName === 'Prior FY')?.value ?? 0;
        const delta = prev !== 0 ? (((cur - prev) / prev) * 100).toFixed(1) : 'N/A';
        const label = items[0]?.name ?? '';
        return `${label}: $${(cur / 1e6).toFixed(1)}M (Current) / $${(prev / 1e6).toFixed(1)}M (Prior) — ${delta}% change`;
      },
    },
    legend: { data: ['Current FY', 'Prior FY'] },
    xAxis: { type: 'category', data: data.periods.map((p) => p.label) },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (v: number) => `$${(v / 1e6).toFixed(1)}M`,
      },
    },
    series: [
      { name: 'Current FY', type: 'bar', data: data.periods.map((p) => p.currentFY) },
      { name: 'Prior FY', type: 'bar', data: data.periods.map((p) => p.priorFY), itemStyle: { color: darkColors['ink-muted'] } },
    ],
  };

  return (
    <div>
      <h3 className="text-lg font-semibold text-ink-primary mb-4">Funding Velocity</h3>
      <ReactEChartsCore echarts={echarts} option={option} theme="gda-dark" style={{ height: 320 }} />
      {data.sourceRefs.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {data.sourceRefs.map((src, i) => (
            <SourceUrlChip key={i} url={src.url} source_kind={src.kind} retrieved_at={new Date().toISOString()} data-testid={`data-point-funding-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}
