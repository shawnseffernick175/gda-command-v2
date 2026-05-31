import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PipelineList } from '../PipelineList';
import type { PipelineRow } from '../types';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const baseRow: PipelineRow = {
  id: '1',
  title: 'Test Opp',
  agency: 'Army',
  response_date: '2026-08-01T00:00:00Z',
  pwin: 55,
  pwin_source_url: 'https://example.com/pwin',
  stage: 'capture',
  teaming: 'prime',
  partners: [],
  stage_history: [],
  source_url: 'https://sam.gov/opp/1',
  updated_at: '2026-05-30T12:00:00Z',
};

const rows: PipelineRow[] = [
  { ...baseRow, id: '1', title: 'Alpha Opp' },
  { ...baseRow, id: '2', title: 'Beta Opp', stage: 'submitted', teaming: 'sub', pwin: 80 },
  { ...baseRow, id: '3', title: 'Gamma Opp', stage: 'awarded', teaming: 'self-perform', pwin: 20 },
];

describe('PipelineList', () => {
  it('renders table with all rows', () => {
    render(
      wrap(
        <PipelineList
          rows={rows}
          sortKey="title"
          sortDir="asc"
          onSort={vi.fn()}
          onRowClick={vi.fn()}
          onAdvance={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('Alpha Opp')).toBeInTheDocument();
    expect(screen.getByText('Beta Opp')).toBeInTheDocument();
    expect(screen.getByText('Gamma Opp')).toBeInTheDocument();
  });

  it('calls onSort when sortable header is clicked', () => {
    const onSort = vi.fn();
    render(
      wrap(
        <PipelineList
          rows={rows}
          sortKey="title"
          sortDir="asc"
          onSort={onSort}
          onRowClick={vi.fn()}
          onAdvance={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByText('Agency'));
    expect(onSort).toHaveBeenCalledWith('agency');
  });

  it('calls onRowClick when a row is clicked', () => {
    const onRowClick = vi.fn();
    render(
      wrap(
        <PipelineList
          rows={rows}
          onRowClick={onRowClick}
          onAdvance={vi.fn()}
        />,
      ),
    );
    fireEvent.click(screen.getByText('Alpha Opp'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('shows empty state when no rows', () => {
    render(
      wrap(
        <PipelineList
          rows={[]}
          onRowClick={vi.fn()}
          onAdvance={vi.fn()}
        />,
      ),
    );
    expect(screen.getByText('No pipeline items match the current filters.')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      wrap(
        <PipelineList
          rows={[]}
          onRowClick={vi.fn()}
          onAdvance={vi.fn()}
          loading={true}
        />,
      ),
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders stage chip, teaming chip, and pwin chip per row', () => {
    render(
      wrap(
        <PipelineList
          rows={[rows[0]!]}
          onRowClick={vi.fn()}
          onAdvance={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('stage-chip')).toHaveTextContent('Capture');
    expect(screen.getByTestId('teaming-chip')).toHaveTextContent('Prime');
    expect(screen.getByTestId('pwin-chip')).toHaveTextContent('55% Pwin');
  });
});
