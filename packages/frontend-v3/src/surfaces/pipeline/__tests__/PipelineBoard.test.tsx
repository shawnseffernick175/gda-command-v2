import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PipelineBoard } from '../PipelineBoard';
import type { PipelineRow } from '../types';
import { PIPELINE_STAGES, STAGE_LABELS } from '../types';

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
  stage: 'identified',
  teaming: 'prime',
  partners: [],
  stage_history: [],
  source_url: 'https://sam.gov/opp/1',
  updated_at: '2026-05-30T12:00:00Z',
};

function makeRows(): PipelineRow[] {
  return PIPELINE_STAGES.map((stage, i) => ({
    ...baseRow,
    id: String(i + 1),
    title: `Opp ${stage}`,
    stage,
  }));
}

describe('PipelineBoard', () => {
  it('renders columns for all 8 stages', () => {
    render(
      wrap(
        <PipelineBoard
          rows={[]}
          onAdvance={vi.fn()}
          onRowClick={vi.fn()}
        />,
      ),
    );
    for (const stage of PIPELINE_STAGES) {
      expect(screen.getByTestId(`board-column-${stage}`)).toBeInTheDocument();
      expect(screen.getByText(STAGE_LABELS[stage])).toBeInTheDocument();
    }
  });

  it('cards populate from mock list response', () => {
    const rows = makeRows();
    render(
      wrap(
        <PipelineBoard
          rows={rows}
          onAdvance={vi.fn()}
          onRowClick={vi.fn()}
        />,
      ),
    );
    const cards = screen.getAllByTestId('pipeline-card');
    expect(cards.length).toBe(8);
    expect(screen.getByText('Opp identified')).toBeInTheDocument();
    expect(screen.getByText('Opp awarded')).toBeInTheDocument();
  });

  it('cards appear in the correct stage column', () => {
    const rows: PipelineRow[] = [
      { ...baseRow, id: '1', stage: 'capture', title: 'Capture Opp' },
      { ...baseRow, id: '2', stage: 'submitted', title: 'Submitted Opp' },
    ];
    render(
      wrap(
        <PipelineBoard
          rows={rows}
          onAdvance={vi.fn()}
          onRowClick={vi.fn()}
        />,
      ),
    );
    const captureCol = screen.getByTestId('board-column-capture');
    expect(within(captureCol).getByText('Capture Opp')).toBeInTheDocument();
    const submittedCol = screen.getByTestId('board-column-submitted');
    expect(within(submittedCol).getByText('Submitted Opp')).toBeInTheDocument();
  });

  it('renders pwin and teaming chips on cards', () => {
    render(
      wrap(
        <PipelineBoard
          rows={[baseRow]}
          onAdvance={vi.fn()}
          onRowClick={vi.fn()}
        />,
      ),
    );
    expect(screen.getByTestId('pwin-chip')).toHaveTextContent('55% Pwin');
    expect(screen.getByTestId('teaming-chip')).toHaveTextContent('Prime');
  });

  it('renders source link on cards with source_url', () => {
    render(
      wrap(
        <PipelineBoard
          rows={[baseRow]}
          onAdvance={vi.fn()}
          onRowClick={vi.fn()}
        />,
      ),
    );
    const link = screen.getByTestId('source-link');
    expect(link).toHaveAttribute('data-source-url', 'https://sam.gov/opp/1');
    expect(link).toHaveAttribute('href', 'https://sam.gov/opp/1');
  });
});
