import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ActionItemsList } from '../ActionItemsList';
import type { ActionItem } from '../types';

function makeItem(): ActionItem {
  return {
    id: 'ai-1',
    title: 'Follow up with TACOM',
    title_sources: [],
    detail: null,
    detail_sources: [],
    owner: 'Shawn',
    owner_sources: [],
    status: 'open',
    due_date: '2026-06-15T00:00:00Z',
    due_date_sources: [],
    source: 'email',
    linked_record_type: null,
    linked_record_id: null,
    drafts: [{
      id: 'draft-1',
      action_item_id: 'ai-1',
      kind: 'reply',
      draft_text: 'Original draft text.',
      sources: [],
      status: 'approved',
      created_at: '2026-05-01T00:00:00Z',
    }],
    completed_at: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrowserRouter>{ui}</BrowserRouter>
    </QueryClientProvider>,
  );
}

describe('RegenerateFlow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('click regenerate fires POST /:id/drafts, 200 repopulates textarea', async () => {
    const item = makeItem();
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && String(url).includes('/drafts')) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({
            success: true,
            data: {
              id: 'draft-2',
              action_item_id: 'ai-1',
              kind: 'reply',
              draft_text: 'Regenerated draft text.',
              sources: [],
              status: 'approved',
              created_at: '2026-05-01T00:00:00Z',
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            items: [item],
            pagination: { limit: 50, cursor: null, hasMore: false },
          },
        }),
      });
    });

    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Follow up with TACOM'));

    await waitFor(() => {
      expect(screen.getByTestId('suggested-response-editor')).toBeInTheDocument();
    });

    const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
    await user.click(regenBtn);

    await waitFor(() => {
      expect(screen.getByDisplayValue('Regenerated draft text.')).toBeInTheDocument();
    });
  });

  it('503 ANALYSIS_TIMEOUT shows retry banner', async () => {
    const item = makeItem();
    globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && String(url).includes('/drafts')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { code: 'ANALYSIS_TIMEOUT' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            items: [item],
            pagination: { limit: 50, cursor: null, hasMore: false },
          },
        }),
      });
    });

    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Follow up with TACOM'));

    await waitFor(() => {
      expect(screen.getByTestId('suggested-response-editor')).toBeInTheDocument();
    });

    const regenBtn = screen.getByRole('button', { name: /Regenerate/i });
    await user.click(regenBtn);

    await waitFor(() => {
      expect(screen.getByTestId('regenerate-error')).toBeInTheDocument();
      expect(screen.getByText(/timed out/i)).toBeInTheDocument();
    });
  });
});
