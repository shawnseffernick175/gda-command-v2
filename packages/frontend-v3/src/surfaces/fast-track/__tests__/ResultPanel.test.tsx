import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ResultPanel } from '../ResultPanel';
import type { FastTrackResult } from '../types';

const mockResult: FastTrackResult = {
  id: 'ft-001',
  grade: 'A',
  rationale: 'Strong alignment with NAICS.\n\nExcellent past performance match.',
  naics_match_score: 87,
  recommended_action: 'pursue',
  source_chips: [
    { kind: 'sam_gov', title: 'SAM.gov listing', url: 'https://sam.gov/opp/123', retrieved_at: '2026-05-30T12:00:00Z' },
    { kind: 'fpds', title: 'FPDS award history', url: 'https://fpds.gov/award/456', retrieved_at: '2026-05-30T11:00:00Z' },
    { kind: 'doctrine', title: 'GDA doctrine §4.2', url: '/docs/doctrine#4.2', retrieved_at: '2026-05-30T10:00:00Z' },
  ],
  model_used: 'claude-sonnet-4-5',
  generated_at: '2026-05-30T12:05:00Z',
  cache_hit: true,
};

function renderResult(result = mockResult) {
  return render(
    <MemoryRouter>
      <ResultPanel result={result} />
    </MemoryRouter>,
  );
}

describe('ResultPanel', () => {
  it('renders grade chip with correct value', () => {
    renderResult();
    const gradeEl = screen.getByText('A');
    expect(gradeEl).toHaveAttribute('data-grade', 'A');
  });

  it('renders recommended action chip', () => {
    renderResult();
    expect(screen.getByText('pursue')).toBeInTheDocument();
  });

  it('renders NAICS match score', () => {
    renderResult();
    expect(screen.getByText('87 / 100')).toBeInTheDocument();
  });

  it('renders rationale as paragraphs split on double newline', () => {
    renderResult();
    expect(screen.getByText('Strong alignment with NAICS.')).toBeInTheDocument();
    expect(screen.getByText('Excellent past performance match.')).toBeInTheDocument();
  });

  it('renders source chips section with all sources', () => {
    renderResult();
    expect(screen.getByText('SAM.gov listing')).toBeInTheDocument();
    expect(screen.getByText('FPDS award history')).toBeInTheDocument();
    expect(screen.getByText('GDA doctrine §4.2')).toBeInTheDocument();
  });

  it('renders model and generated timestamp', () => {
    renderResult();
    expect(screen.getByText(/claude-sonnet-4-5/)).toBeInTheDocument();
    expect(screen.getByText(/cached/)).toBeInTheDocument();
  });

  it('has Save to Opportunities link with prefill param', () => {
    renderResult();
    const link = screen.getByText('Save to Opportunities');
    expect(link).toHaveAttribute('href', '/opportunities/new?prefill=ft-001');
  });

  it('has Copy Share Link button', () => {
    renderResult();
    expect(screen.getByText('Copy Share Link')).toBeInTheDocument();
  });
});
