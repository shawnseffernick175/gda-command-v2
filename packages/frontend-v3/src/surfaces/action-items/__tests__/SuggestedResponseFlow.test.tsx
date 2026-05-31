import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ActionItemsList } from '../ActionItemsList';
import type { ActionItem } from '../types';

function makeItem(overrides: Partial<ActionItem> = {}): ActionItem {
  return {
    id: 'ai-1',
    title: 'Follow up with TACOM',
    title_sources: [],
    detail: null,
    detail_sources: [],
    owner: 'Shawn',
    owner_sources: [],
    status: overrides.status ?? 'open',
    due_date: '2026-06-15T00:00:00Z',
    due_date_sources: [],
    source: 'email',
    linked_record_type: null,
    linked_record_id: null,
    drafts: overrides.drafts ?? [{
      id: 'draft-1',
      action_item_id: 'ai-1',
      kind: 'reply',
      draft_text: 'Hi, following up on TACOM.',
      sources: [],
      status: 'approved',
      created_at: '2026-05-01T00:00:00Z',
    }],
    completed_at: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
  };
}

function smartFetch(items: ActionItem[]) {
  return vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
    if (opts?.method === 'PATCH') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: items[0] }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          items,
          pagination: { limit: 50, cursor: null, hasMore: false },
        },
      }),
    });
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

describe('SuggestedResponseFlow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('edit textarea, save fires PATCH', async () => {
    const item = makeItem();
    const fetchMock = smartFetch([item]);
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Follow up with TACOM'));

    await waitFor(() => {
      expect(screen.getByTestId('suggested-response-editor')).toBeInTheDocument();
    });

    // Find the textarea with draft text and edit it
    const textarea = screen.getByDisplayValue('Hi, following up on TACOM.');
    await user.clear(textarea);
    await user.type(textarea, 'Updated response text');

    // Save button inside the suggested response editor should be enabled now
    const editor = screen.getByTestId('suggested-response-editor');
    const saveBtn = within(editor).getByRole('button', { name: /Save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      const patchCalls = (fetchMock.mock.calls as unknown[][]).filter(
        (c) => {
          const opts = c[1] as Record<string, unknown> | undefined;
          return opts && opts.method === 'PATCH';
        }
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('"Use this response" copies to clipboard and sets status in-progress', async () => {
    const item = makeItem({ status: 'open' });
    const fetchMock = smartFetch([item]);
    globalThis.fetch = fetchMock;
    const user = userEvent.setup();

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Follow up with TACOM'));

    await waitFor(() => {
      expect(screen.getByTestId('suggested-response-editor')).toBeInTheDocument();
    });

    const useBtn = screen.getByRole('button', { name: /Use this response/i });
    await user.click(useBtn);

    expect(writeTextMock).toHaveBeenCalledWith('Hi, following up on TACOM.');

    await waitFor(() => {
      const patchCalls = (fetchMock.mock.calls as unknown[][]).filter(
        (c) => {
          const opts = c[1] as Record<string, unknown> | undefined;
          return opts && opts.method === 'PATCH';
        }
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      const opts = patchCalls[0]![1] as Record<string, unknown>;
      const patchBody = JSON.parse(opts.body as string);
      expect(patchBody.status).toBe('in_progress');
    });
  });
});
