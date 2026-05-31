import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { FastTrack } from '../FastTrack';

const mockResult = {
  id: 'ft-001',
  grade: 'A',
  rationale: 'Strong alignment.',
  naics_match_score: 87,
  recommended_action: 'pursue',
  source_chips: [
    { kind: 'sam_gov', title: 'SAM.gov listing', url: 'https://sam.gov/opp/123', retrieved_at: '2026-05-30T12:00:00Z' },
    { kind: 'fpds', title: 'FPDS award history', url: 'https://fpds.gov/award/456', retrieved_at: '2026-05-30T11:00:00Z' },
  ],
  model_used: 'claude-sonnet-4-5',
  generated_at: '2026-05-30T12:05:00Z',
  cache_hit: false,
};

vi.stubGlobal('fetch', vi.fn());

beforeEach(() => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes('/v3/fast-track/ft-001')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockResult, meta: { requestId: 'r1' } }),
      });
    }
    if (url.includes('/v3/fast-track')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { items: [], next_cursor: null }, meta: { requestId: 'r2' } }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: 'not found' }) });
  });
});

function renderWithId() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/fast-track?id=ft-001']}>
        <FastTrack />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('[R1] Fast Track source citation contract', () => {
  it('[data-stat="naics-match-score"] has data-source-url', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const el = container.querySelector('[data-stat="naics-match-score"]');
      expect(el).not.toBeNull();
      expect(el!.getAttribute('data-source-url')).not.toBe('');
    });
  });

  it('[data-grade] has data-source-url', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const el = container.querySelector('[data-grade]');
      expect(el).not.toBeNull();
      expect(el!.getAttribute('data-source-url')).not.toBe('');
    });
  });

  it('source chips section renders ≥ 1 link per loaded result', async () => {
    const { container } = renderWithId();
    await waitFor(() => {
      const section = container.querySelector('[data-testid="source-chips-section"]');
      expect(section).not.toBeNull();
      const links = section!.querySelectorAll('a[href]');
      expect(links.length).toBeGreaterThanOrEqual(1);
    });
  });
});
