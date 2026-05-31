import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PipelineBoard } from '../PipelineBoard';
import { PwinChip } from '../components/PwinChip';
import { SourceLink } from '../components/SourceLink';
import type { PipelineRow } from '../types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const row: PipelineRow = {
  id: '1',
  title: 'R1 Test Opp',
  agency: 'Navy',
  response_date: '2026-09-15T00:00:00Z',
  pwin: 72,
  pwin_source_url: 'https://ml-model.example.com/pwin/1',
  stage: 'proposal',
  teaming: 'sub',
  partners: [
    { id: 'p1', name: 'Riverstone', role: 'partner', source_url: 'https://sam.gov/entity/riverstone' },
  ],
  stage_history: [
    { stage: 'identified', changed_at: '2026-06-01T00:00:00Z', changed_by: 'system', source_url: 'https://example.com/history/1' },
    { stage: 'qualified', changed_at: '2026-07-01T00:00:00Z', changed_by: 'shawn', source_url: 'https://example.com/history/2' },
  ],
  source_url: 'https://sam.gov/opp/r1-test',
  updated_at: '2026-08-10T00:00:00Z',
};

describe('R1 Source Links', () => {
  it('pwin chip has data-source-url attribute', () => {
    render(<PwinChip pwin={72} sourceUrl="https://ml-model.example.com/pwin/1" />);
    const anchor = screen.getByRole('link');
    expect(anchor).toHaveAttribute('data-source-url', 'https://ml-model.example.com/pwin/1');
    expect(anchor).toHaveAttribute('href', 'https://ml-model.example.com/pwin/1');
  });

  it('pwin chip without source URL renders without link', () => {
    render(<PwinChip pwin={45} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByTestId('pwin-chip')).toHaveTextContent('45% Pwin');
  });

  it('source link has data-source-url attribute and working href', () => {
    render(<SourceLink url="https://sam.gov/opp/r1-test" />);
    const link = screen.getByTestId('source-link');
    expect(link).toHaveAttribute('data-source-url', 'https://sam.gov/opp/r1-test');
    expect(link).toHaveAttribute('href', 'https://sam.gov/opp/r1-test');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('board card renders all R1 source annotations', () => {
    render(
      wrap(
        <PipelineBoard
          rows={[row]}
          onAdvance={vi.fn()}
          onRowClick={vi.fn()}
        />,
      ),
    );
    const sourceLink = screen.getByTestId('source-link');
    expect(sourceLink).toHaveAttribute('data-source-url', 'https://sam.gov/opp/r1-test');

    const pwinChip = screen.getByTestId('pwin-chip');
    expect(pwinChip.closest('[data-source-url]')).toHaveAttribute(
      'data-source-url',
      'https://ml-model.example.com/pwin/1',
    );
  });
});
