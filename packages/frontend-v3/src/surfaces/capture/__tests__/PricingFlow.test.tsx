import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CaptureDetail } from '../CaptureDetail';

const mockCapture = {
  id: 'cap-1',
  pipeline_item_id: 'pi-1',
  pipeline_capture_owner: 'shawn',
  opportunity_title: 'Army RS3 Sustainment',
  opportunity_title_sources: [],
  opportunity_agency: 'US Army',
  opportunity_agency_sources: [],
  color_stage: 'pink' as const,
  capture_plan: {},
  pricing_notes: null,
  compliance_status: 'incomplete',
  win_themes: [],
  ghost_team: null,
  compliance_items: [],
  pwin: 0.62,
  ai_analyzed_at: '2026-05-30T14:00:00Z',
  analysis_version: 'v0.0.1',
  source_url: 'https://sam.gov/opp/rs3',
  source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/rs3', retrieved_at: '2026-05-30T12:00:00Z' }],
  pwin_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pwin', retrieved_at: '2026-05-30T12:00:00Z' }],
  compliance_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/compliance', retrieved_at: '2026-05-30T12:00:00Z' }],
  compliance_coverage: 0.75,
  pricing: {
    labor_categories: [{ id: 'lc1', category: 'Sr Engineer', hours: 1000, rate: 150 }],
    total: 150000,
    benchmark_band_low: 120000,
    benchmark_band_high: 180000,
    total_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pricing', retrieved_at: '2026-05-30T12:00:00Z' }],
    benchmark_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/benchmark', retrieved_at: '2026-05-30T12:00:00Z' }],
  },
  teaming_partners: [],
  created_at: '2026-05-30T12:00:00Z',
  updated_at: '2026-05-30T14:00:00Z',
};

const mockAnalysis = {
  pwin: 0.65,
  pwin_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pwin', retrieved_at: '2026-05-30T14:00:00Z' }],
  color_stage: 'pink',
  compliance_coverage: 0.8,
  compliance_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/compliance', retrieved_at: '2026-05-30T14:00:00Z' }],
  pricing_band: '$120K-$180K',
  pricing_band_sources: [],
  teaming_recommendation: '',
  teaming_recommendation_sources: [],
};

const mockUpdateResult = {
  pricing: {
    labor_categories: [{ id: 'lc1', category: 'Sr Engineer', hours: 2000, rate: 150 }],
    total: 300000,
    benchmark_band_low: 120000,
    benchmark_band_high: 180000,
    total_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/pricing', retrieved_at: '2026-05-30T15:00:00Z' }],
    benchmark_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures/cap-1/benchmark', retrieved_at: '2026-05-30T15:00:00Z' }],
  },
  teaming_partners: [],
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

describe('PricingFlow', () => {
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
      if (urlStr.includes('/captures/cap-1') && init?.method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockUpdateResult, meta: { generatedAt: '2026-05-30T15:00:00Z', source: 'v3', requestId: 'r4' } }),
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

  it('enter rows and save fires PATCH', async () => {
    const user = userEvent.setup();
    render(<CaptureDetail />, { wrapper });

    await screen.findByText('Army RS3 Sustainment');

    const pricingTab = screen.getByRole('tab', { name: 'Pricing' });
    await user.click(pricingTab);

    const saveBtn = await screen.findByRole('button', { name: 'Save Pricing' });
    await user.click(saveBtn);

    await waitFor(() => {
      const patchCalls = vi.mocked(globalThis.fetch).mock.calls.filter(
        ([url, init]) => {
          const urlStr = typeof url === 'string' ? url : url.toString();
          return urlStr.includes('/captures/cap-1') && (init as RequestInit | undefined)?.method === 'PATCH';
        }
      );
      expect(patchCalls.length).toBe(1);
    });
  });

  it('shows pricing total and benchmark band', async () => {
    const user = userEvent.setup();
    render(<CaptureDetail />, { wrapper });

    await screen.findByText('Army RS3 Sustainment');

    const pricingTab = screen.getByRole('tab', { name: 'Pricing' });
    await user.click(pricingTab);

    expect(await screen.findByTestId('data-point-pricing-total')).toBeInTheDocument();
    expect(screen.getByTestId('data-point-benchmark-band')).toBeInTheDocument();
  });

  it('pricing total has data-source-url', async () => {
    const user = userEvent.setup();
    render(<CaptureDetail />, { wrapper });

    await screen.findByText('Army RS3 Sustainment');

    const pricingTab = screen.getByRole('tab', { name: 'Pricing' });
    await user.click(pricingTab);

    const totalEl = await screen.findByTestId('data-point-pricing-total');
    expect(totalEl.getAttribute('data-source-url')).toBeTruthy();
    expect(totalEl.tagName.toLowerCase()).toBe('a');
  });
});
