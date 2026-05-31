import { render, screen, waitFor } from '@testing-library/react';
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
  color_review_findings: [
    { id: 'f1', phase: 'blue' as const, finding: 'Scope gap in section L', severity: 'major' as const, source_url: 'https://sam.gov/opp/rs3', source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/rs3', retrieved_at: '2026-05-30T12:00:00Z' }] },
  ],
  compliance_requirements: [
    { id: 'r1', requirement: 'ISO 9001:2015', met: true, source_citation: 'Section L.4', source_url: 'https://sam.gov/opp/rs3/section-l', source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/rs3/section-l', retrieved_at: '2026-05-30T12:00:00Z' }] },
  ],
  pricing: {
    labor_categories: [{ id: 'lc1', category: 'Sr Engineer', hours: 1000, rate: 150 }],
    total: 150000,
    benchmark_band_low: 120000,
    benchmark_band_high: 180000,
    total_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pricing', retrieved_at: '2026-05-30T12:00:00Z' }],
    benchmark_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/benchmark', retrieved_at: '2026-05-30T12:00:00Z' }],
  },
  teaming_partners: [
    { id: 'tp1', name: 'Riverstone Solutions', role: 'sub' as const, source_url: 'https://sam.gov/entity/riverstone', source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/entity/riverstone', retrieved_at: '2026-05-30T12:00:00Z' }] },
  ],
};

const mockAnalysis = {
  pwin: 0.65,
  pwin_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pwin', retrieved_at: '2026-05-30T14:00:00Z' }],
  color_review_phase: 'blue',
  compliance_coverage: 0.8,
  compliance_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/compliance', retrieved_at: '2026-05-30T14:00:00Z' }],
  pricing_band: '$120K-$180K',
  pricing_band_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pricing-band', retrieved_at: '2026-05-30T14:00:00Z' }],
  teaming_recommendation: 'Team with Riverstone for HUBZone',
  teaming_recommendation_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/teaming-rec', retrieved_at: '2026-05-30T14:00:00Z' }],
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

describe('CaptureDetail', () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockReset();
  });

  it('auto-fires POST /:id/analyze exactly once on mount', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/captures/cap-1/analyze') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockAnalysis, meta: { generatedAt: '2026-05-30T14:00:00Z', source: 'v3', requestId: 'r2' } }),
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

    render(<CaptureDetail />, { wrapper });

    expect(await screen.findByText('Army RS3 Sustainment')).toBeInTheDocument();

    await waitFor(() => {
      const analyzeCalls = vi.mocked(globalThis.fetch).mock.calls.filter(
        ([url, init]) => {
          const urlStr = typeof url === 'string' ? url : url.toString();
          return urlStr.includes('/analyze') && (init as RequestInit | undefined)?.method === 'POST';
        }
      );
      expect(analyzeCalls.length).toBe(1);
    });
  });

  it('renders all tab sections after successful analysis', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/captures/cap-1/analyze') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockAnalysis, meta: { generatedAt: '2026-05-30T14:00:00Z', source: 'v3', requestId: 'r2' } }),
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

    render(<CaptureDetail />, { wrapper });

    expect(await screen.findByText('Army RS3 Sustainment')).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: 'Color Review' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Compliance' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pricing' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Teaming' })).toBeInTheDocument();
  });

  it('shows retry banner on 503 ANALYSIS_TIMEOUT', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/captures/cap-1/analyze') && init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ success: false, error: 'Analysis timed out', code: 'ANALYSIS_TIMEOUT' }),
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

    render(<CaptureDetail />, { wrapper });

    expect(await screen.findByTestId('analysis-timeout-banner')).toBeInTheDocument();
    expect(screen.getByText('Analysis timed out. Results may be stale.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('never shows a manual analyze button', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/captures/cap-1/analyze') && init?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockAnalysis, meta: { generatedAt: '2026-05-30T14:00:00Z', source: 'v3', requestId: 'r2' } }),
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

    render(<CaptureDetail />, { wrapper });

    await screen.findByText('Army RS3 Sustainment');

    expect(screen.queryByRole('button', { name: /analyze/i })).not.toBeInTheDocument();
  });

  it('shows error state on detail fetch failure', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ success: false, error: 'Not found' }),
    } as Response);

    render(<CaptureDetail />, { wrapper });

    expect(await screen.findByText('Failed to load capture')).toBeInTheDocument();
  });
});
