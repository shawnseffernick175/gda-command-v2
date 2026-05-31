import { render, screen, waitFor, within } from '@testing-library/react';
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
    detail: overrides.detail ?? 'Review SOW language for the TACOM procurement',
    detail_sources: [{ kind: 'internal', title: 'Manual entry', url: '/audit/edits/ai-1', retrieved_at: '2026-05-01T00:00:00Z' }],
    owner: overrides.owner ?? 'Shawn',
    owner_sources: [{ kind: 'internal', title: 'Manual entry', url: '/audit/edits/ai-1', retrieved_at: '2026-05-01T00:00:00Z' }],
    status: overrides.status ?? 'open',
    due_date: overrides.due_date ?? '2026-06-15T00:00:00Z',
    due_date_sources: [{ kind: 'internal', title: 'Manual entry', url: '/audit/edits/ai-1', retrieved_at: '2026-05-01T00:00:00Z' }],
    source: overrides.source ?? 'email',
    linked_record_type: overrides.linked_record_type ?? 'opportunity',
    linked_record_id: overrides.linked_record_id ?? 'opp-123',
    drafts: overrides.drafts ?? [{
      id: 'draft-1',
      action_item_id: 'ai-1',
      kind: 'reply',
      draft_text: 'Hi, following up on the TACOM item.',
      sources: [{ kind: 'internal', title: 'AI draft', url: '/audit/drafts/stub', retrieved_at: '2026-05-01T00:00:00Z' }],
      status: 'approved',
      created_at: '2026-05-01T00:00:00Z',
    }],
    completed_at: overrides.completed_at ?? null,
    created_at: overrides.created_at ?? '2026-05-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-05-01T00:00:00Z',
  };
}

function mockFetch(items: ActionItem[]) {
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

describe('ActionItemDetail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('click row opens drawer with full body and source link', async () => {
    const item = makeItem();
    globalThis.fetch = mockFetch([item]);
    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Follow up with TACOM'));

    await waitFor(() => {
      expect(screen.getByTestId('action-item-detail')).toBeInTheDocument();
    });

    expect(screen.getByText('Review SOW language for the TACOM procurement')).toBeInTheDocument();
    const detail = screen.getByTestId('action-item-detail');
    expect(within(detail).getByText('Shawn')).toBeInTheDocument();
    expect(screen.getByTestId('suggested-response-editor')).toBeInTheDocument();
  });

  it('source link is clickable with correct href', async () => {
    const item = makeItem({
      linked_record_type: 'opportunity',
      linked_record_id: 'opp-456',
    });
    globalThis.fetch = mockFetch([item]);
    const user = userEvent.setup();
    renderWithProviders(<ActionItemsList />);

    await waitFor(() => {
      expect(screen.getByText('Follow up with TACOM')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Follow up with TACOM'));

    await waitFor(() => {
      expect(screen.getByTestId('action-item-detail')).toBeInTheDocument();
    });

    const sourceLinks = screen.getAllByText('opportunity');
    const anchorLink = sourceLinks.find(el => el.closest('a'));
    expect(anchorLink).toBeDefined();
    const anchor = anchorLink!.closest('a');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('href')).toBe('/opp/opp-456');
    expect(anchor!.getAttribute('data-source-url')).toBe('/opp/opp-456');
  });
});
