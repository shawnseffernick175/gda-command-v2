import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SummaryCardGrid } from '../SummaryCardGrid';
import type { LaunchpadSummary } from '../types';

const mockData: LaunchpadSummary = {
  qualified_due_this_week: 7,
  qualified_due_this_week_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/opportunities?status=qualified', retrieved_at: '2026-05-30T12:00:00Z' }],
  pipeline_no_capture: 0,
  pipeline_no_capture_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/pipeline?no_capture=1', retrieved_at: '2026-05-30T12:00:00Z' }],
  captures_color_review_stale: 2,
  captures_color_review_stale_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures?stale_review=1', retrieved_at: '2026-05-30T12:00:00Z' }],
  action_items_open_today: 4,
  action_items_open_today_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/action-items?status=open&due=today', retrieved_at: '2026-05-30T12:00:00Z' }],
  action_items_overdue: 1,
  action_items_overdue_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/action-items?status=open&overdue=1', retrieved_at: '2026-05-30T12:00:00Z' }],
};

function renderGrid(props?: Partial<Parameters<typeof SummaryCardGrid>[0]>) {
  return render(
    <MemoryRouter>
      <SummaryCardGrid
        data={mockData}
        isLoading={false}
        isError={false}
        error={null}
        refetch={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('SummaryCardGrid', () => {
  it('renders all 5 cards with values', () => {
    renderGrid();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders labels', () => {
    renderGrid();
    expect(screen.getByText('Qualified \u2014 Due This Week')).toBeInTheDocument();
    expect(screen.getByText('Pipeline \u2014 No Capture')).toBeInTheDocument();
    expect(screen.getByText('Captures \u2014 Color Review Stale')).toBeInTheDocument();
    expect(screen.getByText('Action Items \u2014 Open Today')).toBeInTheDocument();
    expect(screen.getByText('Action Items \u2014 Overdue')).toBeInTheDocument();
  });

  it('each card has aria-label with label + value', () => {
    renderGrid();
    expect(screen.getByLabelText('Qualified \u2014 Due This Week: 7')).toBeInTheDocument();
    expect(screen.getByLabelText('Action Items \u2014 Overdue: 1')).toBeInTheDocument();
  });

  it('applies critical tint when captures stale > 0', () => {
    const { container } = renderGrid();
    const staleCard = container.querySelector('[data-stat="captures_color_review_stale"]');
    expect(staleCard?.className).toContain('border-l-critical');
  });

  it('applies warning tint when qualified > 5', () => {
    const { container } = renderGrid();
    const qualCard = container.querySelector('[data-stat="qualified_due_this_week"]');
    expect(qualCard?.className).toContain('border-l-warning');
  });

  it('shows skeletons when loading', () => {
    const { container } = renderGrid({ data: undefined, isLoading: true });
    expect(container.querySelectorAll('.animate-pulse').length).toBe(5);
  });

  it('shows error state with retry button', () => {
    renderGrid({ isError: true, error: new Error('Network fail'), data: undefined });
    expect(screen.getByText(/Failed to load summary/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders source pills with data-testid', () => {
    const { container } = renderGrid();
    const pills = container.querySelectorAll('[data-testid="data-point-source-pill"]');
    expect(pills.length).toBeGreaterThanOrEqual(5);
  });
});
