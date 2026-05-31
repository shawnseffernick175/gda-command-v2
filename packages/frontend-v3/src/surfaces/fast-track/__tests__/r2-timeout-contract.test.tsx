import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { FastTrack } from '../FastTrack';

vi.stubGlobal('fetch', vi.fn());

const validInput = {
  title: 'Test Opportunity',
  description: 'A valid description for testing the fast track surface.',
  naics_codes: ['541330'],
  set_aside: null,
  place_of_performance: null,
};

const mockSuccessResult = {
  id: 'ft-002',
  grade: 'B',
  rationale: 'Moderate alignment.',
  naics_match_score: 62,
  recommended_action: 'watch',
  source_chips: [
    { kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/789', retrieved_at: '2026-05-30T12:00:00Z' },
  ],
  model_used: 'claude-sonnet-4-5',
  generated_at: '2026-05-30T12:05:00Z',
  cache_hit: false,
};

function renderFastTrack() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/fast-track']}>
        <FastTrack />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillAndSubmit() {
  const titleInput = screen.getByLabelText(/title/i);
  fireEvent.change(titleInput, { target: { value: validInput.title } });

  const descInput = screen.getByLabelText(/description/i);
  fireEvent.change(descInput, { target: { value: validInput.description } });

  const naicsInput = screen.getByLabelText(/naics/i);
  fireEvent.change(naicsInput, { target: { value: '541330' } });
  fireEvent.keyDown(naicsInput, { key: 'Enter' });

  fireEvent.click(screen.getByRole('button', { name: /triage opportunity/i }));
}

describe('[R2] Timeout contract', () => {
  it('on 503 ANALYSIS_TIMEOUT, only TimeoutBanner renders — no result panel, no perpetual spinner', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/v3/fast-track')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({
            success: false,
            error: 'Fast track triage exceeded 10s sync window.',
            code: 'ANALYSIS_TIMEOUT',
            meta: { requestId: 'r1' },
          }),
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

    renderFastTrack();
    await waitFor(() => expect(screen.getByTestId('history-empty')).toBeInTheDocument());

    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByTestId('timeout-banner')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('result-panel')).not.toBeInTheDocument();
    expect(screen.queryByText(/analyzing/i)).not.toBeInTheDocument();
  });

  it('on 200 response, only result panel renders — no banner', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/v3/fast-track')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockSuccessResult, meta: { requestId: 'r1' } }),
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

    renderFastTrack();
    await waitFor(() => expect(screen.getByTestId('history-empty')).toBeInTheDocument());

    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByTestId('result-panel')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('timeout-banner')).not.toBeInTheDocument();
  });

  it('Retry button on banner re-invokes same POST with identical body', async () => {
    let postCount = 0;
    let lastBody: string | null = null;

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/v3/fast-track')) {
        postCount++;
        lastBody = opts?.body as string;
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({
            success: false,
            error: 'Timeout',
            code: 'ANALYSIS_TIMEOUT',
            meta: { requestId: `r${postCount}` },
          }),
        });
      }
      if (url.includes('/v3/fast-track')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { items: [], next_cursor: null }, meta: { requestId: 'rh' } }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: 'not found' }) });
    });

    renderFastTrack();
    await waitFor(() => expect(screen.getByTestId('history-empty')).toBeInTheDocument());

    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByTestId('timeout-banner')).toBeInTheDocument();
    });

    const firstBody = lastBody;
    expect(postCount).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(postCount).toBe(2);
    });

    expect(lastBody).toBe(firstBody);
  });

  it('there is no intermediate "Processing..." state visible after initial 10s submit window', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: RequestInit) => {
      if (opts?.method === 'POST' && url.includes('/v3/fast-track')) {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({
            success: false,
            error: 'Timeout',
            code: 'ANALYSIS_TIMEOUT',
            meta: { requestId: 'r1' },
          }),
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

    renderFastTrack();
    await waitFor(() => expect(screen.getByTestId('history-empty')).toBeInTheDocument());

    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByTestId('timeout-banner')).toBeInTheDocument();
    });

    expect(screen.queryByText('Processing...')).not.toBeInTheDocument();
  });
});
