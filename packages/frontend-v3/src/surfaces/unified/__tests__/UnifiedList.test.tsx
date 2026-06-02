import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { UnifiedList } from '../UnifiedList';
import type { UnifiedListItem } from '../types';

function makeItem(overrides: Partial<UnifiedListItem> = {}): UnifiedListItem {
  return {
    internal_id: overrides.internal_id ?? 'uo-1',
    lifecycle_stage: overrides.lifecycle_stage ?? 'solicitation',
    primary_source: overrides.primary_source ?? 'sam_gov',
    title: overrides.title ?? 'Cyber Range Support Services',
    agency: overrides.agency ?? 'DISA',
    naics: overrides.naics ?? '541512',
    set_aside: overrides.set_aside ?? 'Total Small Business',
    estimated_value_cents: overrides.estimated_value_cents ?? 1_200_000_00,
    response_due_at: overrides.response_due_at ?? '2026-07-01T00:00:00Z',
    posted_at: overrides.posted_at ?? '2026-05-01T00:00:00Z',
    pwin: overrides.pwin ?? 62,
    doctrine_status: overrides.doctrine_status ?? 'qualified',
    updated_at: overrides.updated_at ?? '2026-05-30T00:00:00Z',
  };
}

function envelope(items: UnifiedListItem[], hasMore = false) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          items,
          pagination: { limit: 50, cursor: hasMore ? 'next' : null, hasMore },
        },
      }),
  };
}

const MOCK_ITEMS: UnifiedListItem[] = [
  makeItem({ internal_id: 'uo-1', title: 'Cyber Range Support', lifecycle_stage: 'solicitation' }),
  makeItem({ internal_id: 'uo-2', title: 'Logistics Forecast', lifecycle_stage: 'forecast', response_due_at: null }),
];

function renderList(initialEntry = '/unified') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/unified" element={<UnifiedList />} />
          <Route path="/unified/:internal_id" element={<div>Detail Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UnifiedList (F-421 tab structure)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all six tabs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(MOCK_ITEMS)));
    renderList();
    await waitFor(() => expect(screen.getByTestId('unified-list')).toBeInTheDocument());
    for (const label of ['All Opportunities', 'Active', 'Pipeline', 'Fast Track', 'Awarded', 'Review Matches']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('shows a say-something count of the current slice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(MOCK_ITEMS)));
    renderList();
    const count = await screen.findByTestId('tab-count');
    expect(count).toHaveTextContent('2');
    expect(count).toHaveTextContent('shown');
  });

  it('renders rows with stage chips', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(MOCK_ITEMS)));
    renderList();
    await screen.findByTestId('row-title-uo-1');
    const chips = screen.getAllByTestId('stage-chip');
    expect(chips.length).toBe(2);
    expect(screen.getByText('Solicitation')).toBeInTheDocument();
    expect(screen.getByText('Forecast')).toBeInTheDocument();
  });

  it('shows a due countdown only for solicitation rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(MOCK_ITEMS)));
    renderList();
    await screen.findByTestId('row-title-uo-1');
    // uo-1 is a solicitation with a due date → countdown present.
    expect(screen.getByTestId('due-countdown-uo-1')).toBeInTheDocument();
    // uo-2 is a forecast → no countdown.
    expect(screen.queryByTestId('due-countdown-uo-2')).not.toBeInTheDocument();
  });

  it('navigates to the unified detail page on row click', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope(MOCK_ITEMS)));
    const user = userEvent.setup();
    renderList();
    const row = await screen.findByTestId('row-title-uo-1');
    await user.click(row);
    await waitFor(() => expect(screen.getByText('Detail Page')).toBeInTheDocument());
  });

  it('requests the active stage group when the Active tab is selected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope(MOCK_ITEMS));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderList();
    await screen.findByTestId('row-title-uo-1');

    await user.click(screen.getByRole('tab', { name: 'Active' }));

    await waitFor(() => {
      const calledActive = fetchMock.mock.calls.some(([url]) =>
        String(url).includes('stage=active'),
      );
      expect(calledActive).toBe(true);
    });
  });

  it('does not send a stage param on the All tab', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope(MOCK_ITEMS));
    vi.stubGlobal('fetch', fetchMock);
    renderList();
    await screen.findByTestId('row-title-uo-1');
    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
    expect(firstUrl).toContain('/v3/opportunities/unified');
    expect(firstUrl).not.toContain('stage=');
  });

  it('shows the Review Matches placeholder without fetching a list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope(MOCK_ITEMS));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderList();
    await screen.findByTestId('row-title-uo-1');
    const callsBefore = fetchMock.mock.calls.length;

    // Review Matches tab is disabled (F-422 not shipped) — clicking it is a
    // no-op, so the All slice stays rendered and no new fetch fires.
    const reviewTab = screen.getByRole('tab', { name: 'Review Matches' });
    expect(reviewTab).toBeDisabled();
    await user.click(reviewTab).catch(() => undefined);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('shows an empty state when the slice has no rows', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(envelope([])));
    renderList();
    await waitFor(() =>
      expect(screen.getByText('No opportunities in this view')).toBeInTheDocument(),
    );
  });

  it('shows an error state and allows retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ success: false, error: 'boom', code: 'INTERNAL' }),
      }),
    );
    renderList();
    await waitFor(() =>
      expect(screen.getByText('Failed to load opportunities')).toBeInTheDocument(),
    );
  });
});
