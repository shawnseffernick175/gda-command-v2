import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ActionItemsList } from '../ActionItemsList';
import type { ActionItem } from '../types';

function makeItem(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: overrides.id ?? 'ai-1',
    title: overrides.title ?? 'Follow up with TACOM',
    title_sources: [{ kind: 'internal', title: 'Manual entry', url: '/audit/edits/ai-1', retrieved_at: '2026-05-01T00:00:00Z' }],
    detail: overrides.detail ?? 'Review SOW language',
    detail_sources: [{ kind: 'internal', title: 'Manual entry', url: '/audit/edits/ai-1', retrieved_at: '2026-05-01T00:00:00Z' }],
    owner: overrides.owner ?? 'Shawn',
    owner_sources: [{ kind: 'internal', title: 'Manual entry', url: '/audit/edits/ai-1', retrieved_at: '2026-05-01T00:00:00Z' }],
    status: overrides.status ?? 'open',
    due_date: overrides.due_date ?? '2026-06-15T00:00:00Z',
    due_date_sources: [{ kind: 'internal', title: 'Manual entry', url: '/audit/edits/ai-1', retrieved_at: '2026-05-01T00:00:00Z' }],
    source: overrides.source ?? 'email',
    linked_record_type: overrides.linked_record_type ?? 'opportunity',
    linked_record_id: overrides.linked_record_id ?? 'opp-123',
    drafts: overrides.drafts ?? [],
    completed_at: overrides.completed_at ?? null,
    created_at: overrides.created_at ?? '2026-05-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-05-01T00:00:00Z',
  };
}

const MOCK_ITEMS: ActionItem[] = [
  makeItem({ id: 'ai-1', title: 'Follow up with TACOM', due_date: '2026-06-15T00:00:00Z', source: 'email' }),
  makeItem({ id: 'ai-2', title: 'Review RS3 proposal', due_date: '2026-06-01T00:00:00Z', source: 'capture', status: 'in_progress' }),
  makeItem({ id: 'ai-3', title: 'Submit OASIS TO', due_date: null, source: 'manual', status: 'done' }),
];

function mockFetch(items: ActionItem[] = MOCK_ITEMS, hasMore = false) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      success: true,
      data: {
        items,
        pagination: { limit: 50, cursor: hasMore ? 'next-cursor' : null, hasMore },
      },
    }),
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('ActionItemsList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders rows from mock list response', async () => {
    globalThis.fetch = mockFetch();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    expect(screen.getByText('Review RS3 proposal')).toBeInTheDocument();
    expect(screen.getByText('Submit OASIS TO')).toBeInTheDocument();
  });

  it('default sort is due date ascending', async () => {
    globalThis.fetch = mockFetch();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    const table = screen.getByRole('grid');
    const rows = within(table).getAllByRole('row');
    // header + 3 data rows
    expect(rows.length).toBe(4);
    // First data row should be "Review RS3 proposal" (Jun 1 < Jun 15 < null=Infinity)
    expect(within(rows[1]!).getByText('Review RS3 proposal')).toBeInTheDocument();
  });

  it('sort header click flips order', async () => {
    globalThis.fetch = mockFetch();
    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    // Default sort: due_date asc → "Review RS3 proposal" (Jun 1) first
    const table = screen.getByRole('grid');
    let rows = within(table).getAllByRole('row');
    expect(within(rows[1]!).getByText('Review RS3 proposal')).toBeInTheDocument();

    // Click Title header to sort by title asc
    const titleHeader = screen.getByRole('columnheader', { name: /Title/i });
    await user.click(titleHeader);

    rows = within(table).getAllByRole('row');
    // title asc: Follow up < Review < Submit
    expect(within(rows[1]!).getByText('Follow up with TACOM')).toBeInTheDocument();
  });

  it('filters re-query correctly', async () => {
    const fetchMock = mockFetch();
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    // Find the status filter button (displays "All Statuses")
    const buttons = screen.getAllByRole('button');
    const statusButton = buttons.find(b => b.textContent?.includes('All Statuses'));
    expect(statusButton).toBeDefined();
    await user.click(statusButton!);

    const openOption = await screen.findByRole('option', { name: 'Open' });
    await user.click(openOption);

    // Verify fetch was called with status filter
    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown[][];
      const lastCall = calls[calls.length - 1];
      if (lastCall) {
        expect(String(lastCall[0])).toContain('status=open');
      }
    });
  });

  it('pagination next/prev re-queries with new offset', async () => {
    const fetchMock = mockFetch(MOCK_ITEMS, true);
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: /Next/i });
    expect(nextBtn).not.toBeDisabled();
    await user.click(nextBtn);

    await waitFor(() => {
      const calls = fetchMock.mock.calls;
      const lastCall = calls[calls.length - 1];
      if (lastCall) {
        expect(String(lastCall[0])).toContain('cursor=next-cursor');
      }
    });
  });
});
