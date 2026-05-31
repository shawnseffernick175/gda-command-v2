import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpportunitiesList } from '../OpportunitiesList';
import type { OpportunitySummary, PaginatedResult, SuccessEnvelope } from '../types';

const SOURCE_REF = { kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/test', retrieved_at: '2026-05-01T00:00:00Z' };

function makeSummary(overrides: Partial<OpportunitySummary> = {}): OpportunitySummary {
  return {
    id: 'opp-1',
    title: 'IT Support Services',
    title_sources: [SOURCE_REF],
    agency: 'Army',
    agency_sources: [SOURCE_REF],
    naics: '541512',
    naics_sources: [SOURCE_REF],
    set_aside: 'Total Small Business',
    set_aside_sources: [SOURCE_REF],
    grade: 'A',
    grade_sources: [SOURCE_REF],
    status: 'watching',
    response_due_at: '2026-07-01T00:00:00Z',
    response_due_at_sources: [SOURCE_REF],
    value_min: 1000000,
    value_min_sources: [SOURCE_REF],
    value_max: 5000000,
    value_max_sources: [SOURCE_REF],
    teaming_flags: [],
    ai_analyzed_at: '2026-05-01T00:00:00Z',
    analysis_version: '1.0',
    created_at: '2026-04-15T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makeEnvelope(items: OpportunitySummary[], hasMore = false): SuccessEnvelope<PaginatedResult<OpportunitySummary>> {
  return {
    success: true,
    data: {
      items,
      pagination: { limit: 25, cursor: hasMore ? 'next-cursor' : null, hasMore },
    },
    meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r1' },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/opportunities']}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OpportunitiesList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders rows from mock response', async () => {
    const items = [makeSummary(), makeSummary({ id: 'opp-2', title: 'Cyber Security', agency: 'Navy' })];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => makeEnvelope(items),
    } as Response);

    render(<OpportunitiesList />, { wrapper });

    expect(await screen.findByText('IT Support Services')).toBeInTheDocument();
    expect(screen.getByText('Cyber Security')).toBeInTheDocument();
    expect(screen.getByText('Army')).toBeInTheDocument();
    expect(screen.getByText('Navy')).toBeInTheDocument();
  });

  it('sort header click flips order and re-queries with new sort', async () => {
    const items = [makeSummary()];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(items),
    } as Response);

    render(<OpportunitiesList />, { wrapper });
    await screen.findByText('IT Support Services');

    const titleHeader = screen.getByRole('columnheader', { name: /title/i });
    await userEvent.click(titleHeader);

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]?.[0];
    expect(String(lastCall)).toContain('sort=title');
  });

  it('filter change re-queries with new filter', async () => {
    const items = [makeSummary()];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(items),
    } as Response);

    render(<OpportunitiesList />, { wrapper });
    await screen.findByText('IT Support Services');

    const statusFilter = screen.getByTestId('filter-status');
    await userEvent.selectOptions(statusFilter, 'qualified');

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]?.[0];
    expect(String(lastCall)).toContain('status=qualified');
  });

  it('pagination next re-queries with new cursor', async () => {
    const items = [makeSummary()];
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(items, true),
    } as Response);

    render(<OpportunitiesList />, { wrapper });
    await screen.findByText('IT Support Services');

    const nextBtn = screen.getByRole('button', { name: /next/i });
    await userEvent.click(nextBtn);

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1]?.[0];
    expect(String(lastCall)).toContain('cursor=next-cursor');
  });

  it('shows empty state when 0 results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => makeEnvelope([]),
    } as Response);

    render(<OpportunitiesList />, { wrapper });

    expect(await screen.findByText('No opportunities found')).toBeInTheDocument();
  });
});
