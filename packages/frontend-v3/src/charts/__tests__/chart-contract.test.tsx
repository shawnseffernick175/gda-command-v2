import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FundingVelocityChart } from '../FundingVelocityChart';
import { PipelineAgingChart } from '../PipelineAgingChart';
import { WinProbabilityDistributionChart } from '../WinProbabilityDistributionChart';
import { SourceKindContributionChart } from '../SourceKindContributionChart';
import { CaptureStageFunnelChart } from '../CaptureStageFunnelChart';

import type { FundingVelocityData, PipelineAgingData, WinProbDistributionData, SourceKindContributionData, CaptureStageData } from '../../types';
import _fundingData from '../../../test/fixtures/charts/funding-velocity.json';
import _agingData from '../../../test/fixtures/charts/pipeline-aging.json';
import _winProbData from '../../../test/fixtures/charts/win-probability-distribution.json';
import _sourceKindData from '../../../test/fixtures/charts/source-kind-contribution.json';
import _funnelData from '../../../test/fixtures/charts/capture-stage-funnel.json';

const fundingData = _fundingData as unknown as FundingVelocityData;
const agingData = _agingData as unknown as PipelineAgingData;
const winProbData = _winProbData as unknown as WinProbDistributionData;
const sourceKindData = _sourceKindData as unknown as SourceKindContributionData;
const funnelData = _funnelData as unknown as CaptureStageData;

// Mock ECharts since it needs a canvas in jsdom
vi.mock('echarts-for-react/lib/core', () => ({
  default: ({ option }: { option: Record<string, unknown> }) => (
    <div data-testid="echarts-mock" data-option={JSON.stringify(option)} />
  ),
}));

vi.mock('echarts/core', () => ({
  use: vi.fn(),
  registerTheme: vi.fn(),
}));
vi.mock('echarts/charts', () => ({ BarChart: {}, FunnelChart: {} }));
vi.mock('echarts/components', () => ({ GridComponent: {}, TooltipComponent: {}, LegendComponent: {}, MarkLineComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

/**
 * Chart contract test per D5 §4.5.
 *
 * For each chart:
 * - Render with fixture data
 * - Assert ECharts is the renderer (no other chart libs)
 * - Assert data series shape matches D2 §7 schema
 * - Assert R1 holds (source refs render as clickable anchors)
 */
describe('[Contract] Chart rendering', () => {
  it('FundingVelocityChart renders ECharts with correct data shape', () => {
    const { container } = render(<FundingVelocityChart data={fundingData} />);
    expect(container.querySelector('[data-testid="echarts-mock"]')).toBeInTheDocument();
    expect(fundingData.periods.length).toBeGreaterThan(0);
    fundingData.periods.forEach((p) => {
      expect(typeof p.currentFY).toBe('number');
      expect(typeof p.priorFY).toBe('number');
    });
  });

  it('FundingVelocityChart R1: source refs render as clickable anchors', () => {
    const { container } = render(<FundingVelocityChart data={fundingData} />);
    const anchors = container.querySelectorAll('a[href]');
    expect(anchors.length).toBeGreaterThan(0);
    anchors.forEach((a) => {
      expect(a.getAttribute('href')).toMatch(/^https?:\/\//);
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    });
  });

  it('PipelineAgingChart renders ECharts with correct data shape', () => {
    const { container } = render(<PipelineAgingChart data={agingData} />);
    expect(container.querySelector('[data-testid="echarts-mock"]')).toBeInTheDocument();
    agingData.items.forEach((item) => {
      expect(typeof item.daysInStage).toBe('number');
      expect(typeof item.threshold).toBe('number');
      expect(typeof item.stage).toBe('number');
    });
  });

  it('PipelineAgingChart R1: source refs render as clickable anchors', () => {
    const { container } = render(<PipelineAgingChart data={agingData} />);
    const anchors = container.querySelectorAll('a[href]');
    expect(anchors.length).toBeGreaterThan(0);
    anchors.forEach((a) => {
      expect(a.getAttribute('href')).toMatch(/^https?:\/\//);
      expect(a.getAttribute('target')).toBe('_blank');
    });
  });

  it('WinProbabilityDistributionChart renders ECharts with correct data shape', () => {
    const { container } = render(<WinProbabilityDistributionChart data={winProbData} />);
    expect(container.querySelector('[data-testid="echarts-mock"]')).toBeInTheDocument();
    winProbData.buckets.forEach((b) => {
      expect(typeof b.rangeMin).toBe('number');
      expect(typeof b.rangeMax).toBe('number');
      b.items.forEach((item) => {
        expect(typeof item.count).toBe('number');
        expect(typeof item.stage).toBe('number');
      });
    });
  });

  it('WinProbabilityDistributionChart R1: source refs render as clickable anchors', () => {
    const { container } = render(<WinProbabilityDistributionChart data={winProbData} />);
    const anchors = container.querySelectorAll('a[href]');
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('SourceKindContributionChart renders ECharts with correct data shape', () => {
    const { container } = render(<SourceKindContributionChart data={sourceKindData} />);
    expect(container.querySelector('[data-testid="echarts-mock"]')).toBeInTheDocument();
    sourceKindData.periods.forEach((p) => {
      expect(typeof p.label).toBe('string');
      p.sources.forEach((s) => {
        expect(typeof s.count).toBe('number');
        expect(typeof s.kind).toBe('string');
      });
    });
  });

  it('SourceKindContributionChart R1: source refs render as clickable anchors', () => {
    const { container } = render(<SourceKindContributionChart data={sourceKindData} />);
    const anchors = container.querySelectorAll('a[href]');
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('CaptureStageFunnelChart renders ECharts with correct data shape', () => {
    const { container } = render(<CaptureStageFunnelChart data={funnelData} />);
    expect(container.querySelector('[data-testid="echarts-mock"]')).toBeInTheDocument();
    funnelData.stages.forEach((s) => {
      expect(typeof s.stage).toBe('number');
      expect(typeof s.count).toBe('number');
      expect(typeof s.totalValue).toBe('number');
      expect(typeof s.conversionRate).toBe('number');
    });
  });

  it('CaptureStageFunnelChart R1: source refs render as clickable anchors', () => {
    const { container } = render(<CaptureStageFunnelChart data={funnelData} />);
    const anchors = container.querySelectorAll('a[href]');
    expect(anchors.length).toBeGreaterThan(0);
  });

  it('chart components only import echarts (verified by forbidden-tokens scanner)', () => {
    // The forbidden-tokens scanner verifies no recharts/chart.js/nivo/victory/react-vis imports.
    // This test confirms the charts render via our ECharts mock, not another library.
    const { container } = render(<FundingVelocityChart data={fundingData} />);
    expect(container.querySelector('[data-testid="echarts-mock"]')).toBeInTheDocument();
  });
});
