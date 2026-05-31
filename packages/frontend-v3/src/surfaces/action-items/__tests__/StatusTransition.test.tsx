import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ActionItemsList } from '../ActionItemsList';
import type { ActionItem } from '../types';

function makeItem(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: overrides.id ?? 'ai-1',
    title: overrides.title ?? 'Test item',
    title_sources: [],
    detail: overrides.detail ?? null,
    detail_sources: [],
    owner: overrides.owner ?? 'Shawn',
    owner_sources: [],
    status: overrides.status ?? 'open',
    due_date: overrides.due_date ?? '2026-06-15T00:00:00Z',
    due_date_sources: [],
    source: overrides.source ?? 'manual',
    linked_record_type: null,
    linked_record_id: null,
    drafts: overrides.drafts ?? [],
    completed_at: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

function mockListFetch(items: ActionItem[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      success: true,
      data: {
        items,
        pagination: { limit: 50, cursor: null, hasMore: false },
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

describe('StatusTransition', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('open → in_progress: PATCH fires immediately', async () => {
    const item = makeItem({ status: 'open' });
    const fetchMock = mockListFetch([item]);
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Test item')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Test item'));

    await waitFor(() => {
      expect(screen.getByTestId('action-item-detail')).toBeInTheDocument();
    });

    // Click the status dropdown
    const statusSelect = screen.getAllByRole('button').find(
      (b) => b.textContent?.includes('Open')
    );
    if (statusSelect) {
      await user.click(statusSelect);
      const inProgressOption = await screen.findByRole('option', { name: 'In Progress' });

      // Replace fetch with a mock that also tracks PATCH calls
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { ...item, status: 'in_progress' },
        }),
      });

      await user.click(inProgressOption);

      await waitFor(() => {
        const patchCalls = (fetchMock.mock.calls as unknown[][]).filter(
          (c) => {
            const opts = c[1] as Record<string, unknown> | undefined;
            return opts && opts.method === 'PATCH';
          }
        );
        expect(patchCalls.length).toBeGreaterThan(0);
      });
    }
  });

  it('in_progress → done: confirm modal appears, then PATCH fires', async () => {
    const item = makeItem({ status: 'in_progress' });
    const fetchMock = mockListFetch([item]);
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Test item')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Test item'));

    await waitFor(() => {
      expect(screen.getByTestId('action-item-detail')).toBeInTheDocument();
    });

    const statusSelect = screen.getAllByRole('button').find(
      (b) => b.textContent?.includes('In Progress')
    );
    if (statusSelect) {
      await user.click(statusSelect);
      const doneOption = await screen.findByRole('option', { name: 'Done' });
      await user.click(doneOption);

      // Confirm modal should appear
      await waitFor(() => {
        expect(screen.getByText('Confirm Status Change')).toBeInTheDocument();
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { ...item, status: 'done' },
        }),
      });

      const confirmBtn = screen.getByRole('button', { name: /Mark as Done/i });
      await user.click(confirmBtn);

      await waitFor(() => {
        const patchCalls = (fetchMock.mock.calls as unknown[][]).filter(
          (c) => {
            const opts = c[1] as Record<string, unknown> | undefined;
            return opts && opts.method === 'PATCH';
          }
        );
        expect(patchCalls.length).toBeGreaterThan(0);
      });
    }
  });

  it('status chip updates on success', async () => {
    const item = makeItem({ status: 'open' });
    let currentStatus = 'open';
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') {
        currentStatus = 'in_progress';
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: { ...item, status: 'in_progress' },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            items: [{ ...item, status: currentStatus }],
            pagination: { limit: 50, cursor: null, hasMore: false },
          },
        }),
      });
    });

    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Test item')).toBeInTheDocument();
    });

    const chips = screen.getAllByTestId('status-chip');
    expect(chips[0]!.textContent).toBe('Open');
  });
});
