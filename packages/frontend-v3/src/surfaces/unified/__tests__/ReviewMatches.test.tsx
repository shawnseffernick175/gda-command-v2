import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReviewMatches } from '../ReviewMatches';
import type { MatchSuggestion } from '../types';

function makeSuggestion(overrides: Partial<MatchSuggestion> = {}): MatchSuggestion {
  return {
    link_id: overrides.link_id ?? 101,
    internal_id: overrides.internal_id ?? 'uo-1',
    source: overrides.source ?? 'govtribe',
    source_native_id: overrides.source_native_id ?? 'GT-555',
    confidence: overrides.confidence ?? 'MEDIUM',
    match_method: overrides.match_method ?? 'title_naics',
    matched_at: overrides.matched_at ?? '2026-05-30T00:00:00Z',
    opportunity: {
      lifecycle_stage: overrides.opportunity?.lifecycle_stage ?? 'solicitation',
      primary_source: overrides.opportunity?.primary_source ?? 'sam',
      title: overrides.opportunity?.title ?? 'Cyber Range Support Services',
      agency: overrides.opportunity?.agency ?? 'DISA',
      naics: overrides.opportunity?.naics ?? '541512',
      estimated_value_cents: overrides.opportunity?.estimated_value_cents ?? 1_200_000_00,
      response_due_at: overrides.opportunity?.response_due_at ?? '2026-07-01T00:00:00Z',
    },
  };
}

function listEnvelope(items: MatchSuggestion[], hasMore = false) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: { items, pagination: { limit: 50, cursor: hasMore ? 'next' : null, hasMore } },
      }),
  };
}

function decisionEnvelope(linkId: number, action: 'confirm' | 'reject') {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          link_id: linkId,
          internal_id: 'uo-1',
          source: 'govtribe',
          source_native_id: 'GT-555',
          confidence: action === 'confirm' ? 'CONFIRMED' : 'REJECTED',
          confirmed_by: 'tester',
          confirmed_at: '2026-06-02T00:00:00Z',
        },
      }),
  };
}

function renderReview(initialEntry = '/unified?tab=review') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ReviewMatches active={true} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReviewMatches (F-422 suggestion queue)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists pending suggestions with opportunity context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listEnvelope([makeSuggestion()])));
    renderReview();
    await screen.findByTestId('suggestion-101');
    expect(screen.getByTestId('suggestion-title-101')).toHaveTextContent('Cyber Range Support Services');
    expect(screen.getByTestId('confidence-101')).toHaveTextContent('MEDIUM');
    expect(screen.getByText('DISA')).toBeInTheDocument();
  });

  it('R1: links the suggested source back to its origin record', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listEnvelope([makeSuggestion()])));
    renderReview();
    const sourceEl = await screen.findByTestId('suggestion-source-101');
    // govtribe + GT-555 -> a clickable GovTribe URL.
    expect(sourceEl.tagName).toBe('A');
    expect(sourceEl).toHaveAttribute('href', expect.stringContaining('GT-555'));
  });

  it('R1: renders plain text for a source with no addressable page (fast_track)', async () => {
    const ft = makeSuggestion({ link_id: 7, source: 'fast_track', source_native_id: 'sig-7' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listEnvelope([ft])));
    renderReview();
    const sourceEl = await screen.findByTestId('suggestion-source-7');
    expect(sourceEl.tagName).toBe('SPAN');
  });

  it('shows a say-something pending count', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listEnvelope([makeSuggestion(), makeSuggestion({ link_id: 102 })])));
    renderReview();
    const count = await screen.findByTestId('review-count');
    expect(count).toHaveTextContent('2');
    expect(count).toHaveTextContent('pending');
  });

  it('confirms a suggestion via POST and shows a resolved state', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listEnvelope([makeSuggestion()]))
      .mockResolvedValueOnce(decisionEnvelope(101, 'confirm'))
      .mockResolvedValue(listEnvelope([makeSuggestion()]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderReview();

    await screen.findByTestId('suggestion-101');
    const confirmWrap = screen.getByTestId('confirm-101');
    await user.click(within(confirmWrap).getByRole('button', { name: 'Confirm' }));

    // The POST fires with the right body.
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('/v3/match-suggestions') && init?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      expect(String(postCall?.[1]?.body)).toContain('"action":"confirm"');
      expect(String(postCall?.[1]?.body)).toContain('"link_id":101');
    });

    // The card flips to its resolved state.
    await waitFor(() => expect(screen.getByTestId('resolved-101')).toHaveTextContent('Confirmed'));
  });

  it('rejects a suggestion via POST', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(listEnvelope([makeSuggestion()]))
      .mockResolvedValueOnce(decisionEnvelope(101, 'reject'))
      .mockResolvedValue(listEnvelope([makeSuggestion()]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderReview();

    await screen.findByTestId('suggestion-101');
    const rejectWrap = screen.getByTestId('reject-101');
    await user.click(within(rejectWrap).getByRole('button', { name: 'Reject' }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes('/v3/match-suggestions') && init?.method === 'POST',
      );
      expect(String(postCall?.[1]?.body)).toContain('"action":"reject"');
    });
    await waitFor(() => expect(screen.getByTestId('resolved-101')).toHaveTextContent('Rejected'));
  });

  it('filters by confidence tier via the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(listEnvelope([makeSuggestion()]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderReview();
    await screen.findByTestId('suggestion-101');

    await user.click(screen.getByRole('button', { name: 'Medium' }));
    await waitFor(() => {
      const called = fetchMock.mock.calls.some(([url]) => String(url).includes('confidence=MEDIUM'));
      expect(called).toBe(true);
    });
  });

  it('shows an empty state when there is nothing to review', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(listEnvelope([])));
    renderReview();
    await waitFor(() => expect(screen.getByText('Nothing to review')).toBeInTheDocument());
  });

  it('shows an error state with retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ success: false, error: 'boom', code: 'INTERNAL' }),
      }),
    );
    renderReview();
    await waitFor(() =>
      expect(screen.getByText('Failed to load match suggestions')).toBeInTheDocument(),
    );
  });

  it('does not fetch when inactive', async () => {
    const fetchMock = vi.fn().mockResolvedValue(listEnvelope([makeSuggestion()]));
    vi.stubGlobal('fetch', fetchMock);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/unified?tab=review']}>
          <ReviewMatches active={false} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // Give react-query a tick; with enabled=false no fetch should fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
