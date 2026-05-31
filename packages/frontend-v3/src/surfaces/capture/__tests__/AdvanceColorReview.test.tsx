import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CaptureDetail } from '../CaptureDetail';

const mockCapture = {
  id: 'cap-1',
  opportunity_title: 'Army RS3 Sustainment',
  agency: 'US Army',
  response_date: '2026-07-15T00:00:00Z',
  color_review_phase: 'blue' as const,
  compliance_coverage: 0.75,
  pwin: 0.62,
  last_analyzed: '2026-05-30T14:00:00Z',
  source_url: 'https://sam.gov/opp/rs3',
  source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/rs3', retrieved_at: '2026-05-30T12:00:00Z' }],
  pwin_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pwin', retrieved_at: '2026-05-30T12:00:00Z' }],
  compliance_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/compliance', retrieved_at: '2026-05-30T12:00:00Z' }],
  color_review_findings: [],
  compliance_requirements: [],
  pricing: {
    labor_categories: [],
    total: 0,
    benchmark_band_low: 0,
    benchmark_band_high: 0,
    total_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pricing', retrieved_at: '2026-05-30T12:00:00Z' }],
    benchmark_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/benchmark', retrieved_at: '2026-05-30T12:00:00Z' }],
  },
  teaming_partners: [],
};

const mockAnalysis = {
  pwin: 0.65,
  pwin_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pwin', retrieved_at: '2026-05-30T14:00:00Z' }],
  color_review_phase: 'blue',
  compliance_coverage: 0.8,
  compliance_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/compliance', retrieved_at: '2026-05-30T14:00:00Z' }],
  pricing_band: '$0-$0',
  pricing_band_sources: [],
  teaming_recommendation: '',
  teaming_recommendation_sources: [],
};

vi.stubGlobal('fetch', vi.fn());

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/capture/cap-1']}>
        <Routes>
          <Route path="/capture/:opp_id" element={children} />
          <Route path="/capture" element={<div>List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AdvanceColorReview', () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockReset();
    vi.mocked(globalThis.fetch).mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/captures/cap-1/analyze') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockAnalysis, meta: { generatedAt: '2026-05-30T14:00:00Z', source: 'v3', requestId: 'r2' } }),
        } as Response);
      }
      if (urlStr.includes('/captures/cap-1/advance-color-review') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { phase: 'pink' }, meta: { generatedAt: '2026-05-30T14:00:00Z', source: 'v3', requestId: 'r3' } }),
        } as Response);
      }
      if (urlStr.includes('/captures/cap-1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockCapture, meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r1' } }),
        } as Response);
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: 'not found' }) } as Response);
    });
  });

  it('click advance opens confirm modal and POST fires on confirm', async () => {
    const user = userEvent.setup();
    render(<CaptureDetail />, { wrapper });

    await screen.findByText('Army RS3 Sustainment');

    const advanceBtn = await screen.findByRole('button', { name: 'Advance' });
    await user.click(advanceBtn);

    expect(await screen.findByText('Advance Color Review')).toBeInTheDocument();
    expect(screen.getByText(/This will advance the color review/)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /Advance to Pink/ });
    await user.click(confirmBtn);

    await waitFor(() => {
      const advanceCalls = vi.mocked(globalThis.fetch).mock.calls.filter(
        ([url, init]) => {
          const urlStr = typeof url === 'string' ? url : url.toString();
          return urlStr.includes('/advance-color-review') && (init as RequestInit | undefined)?.method === 'POST';
        }
      );
      expect(advanceCalls.length).toBe(1);
    });
  });

  it('cancel button closes modal without POST', async () => {
    const user = userEvent.setup();
    render(<CaptureDetail />, { wrapper });

    await screen.findByText('Army RS3 Sustainment');

    const advanceBtn = await screen.findByRole('button', { name: 'Advance' });
    await user.click(advanceBtn);

    expect(await screen.findByText('Advance Color Review')).toBeInTheDocument();

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    await user.click(cancelBtn);

    expect(screen.queryByText('Advance Color Review')).not.toBeInTheDocument();

    const advanceCalls = vi.mocked(globalThis.fetch).mock.calls.filter(
      ([url, init]) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        return urlStr.includes('/advance-color-review') && (init as RequestInit | undefined)?.method === 'POST';
      }
    );
    expect(advanceCalls.length).toBe(0);
  });
});
