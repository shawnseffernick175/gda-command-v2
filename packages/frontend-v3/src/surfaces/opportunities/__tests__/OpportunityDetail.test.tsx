import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpportunityDetailPanel } from '../OpportunityDetail';
import type { OpportunityDetail, SuccessEnvelope, ErrorEnvelope } from '../types';

const SOURCE_REF = { kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/test', retrieved_at: '2026-05-01T00:00:00Z' };

function makeDetail(overrides: Partial<OpportunityDetail> = {}): OpportunityDetail {
  return {
    id: 'opp-1',
    title: 'IT Support Services',
    title_sources: [SOURCE_REF],
    agency: 'Army',
    agency_sources: [SOURCE_REF],
    naics: '541512',
    naics_sources: [SOURCE_REF],
    set_aside: 'Total Small Business',
    set_aside_sources: [SOURCE_REF],
    grade: 'A',
    grade_sources: [SOURCE_REF],
    grade_evidence: 'Strong NAICS alignment with existing past performance',
    status: 'watching',
    response_due_at: '2026-07-01T00:00:00Z',
    response_due_at_sources: [SOURCE_REF],
    value_min: 1000000,
    value_min_sources: [SOURCE_REF],
    value_max: 5000000,
    value_max_sources: [SOURCE_REF],
    teaming_flags: [],
    ai_analyzed_at: '2026-05-01T00:00:00Z',
    analysis_version: '1.0',
    created_at: '2026-04-15T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    sam_notice_id: 'SAM-123',
    sub_agency: null,
    description: 'Full IT support services for Army facilities.',
    description_sources: [SOURCE_REF],
    posted_at: '2026-04-15T00:00:00Z',
    qualified_at: null,
    qualified_by: null,
    analysis: {
      version: '1.0',
      generated_at: '2026-05-01T00:00:00Z',
      pwin: 0.72,
      pwin_sources: [SOURCE_REF],
      incumbent: 'ACME Corp',
      incumbent_sources: [SOURCE_REF],
      competitors: [{ name: 'ACME Corp', threat_level: 'high' }],
      competitors_sources: [SOURCE_REF],
      blackhat: null,
      blackhat_sources: [],
      wargame: { strategy: 'Pursue as prime', win_themes: ['past performance'], discriminators: ['RS3'] },
      wargame_sources: [SOURCE_REF],
      timeline: null,
      timeline_sources: [],
    },
    ...overrides,
  };
}

function makeEnvelope(detail: OpportunityDetail): SuccessEnvelope<OpportunityDetail> {
  return {
    success: true,
    data: detail,
    meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r1' },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('OpportunityDetail (R2 auto-analysis)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('on mount, fires GET /:id for auto-analysis (at least once beyond initial detail fetch)', async () => {
    const detail = makeDetail();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(detail),
    } as Response);

    render(<OpportunityDetailPanel opportunityId="opp-1" onBack={vi.fn()} />, { wrapper });

    await screen.findByTestId('opportunity-detail');

    const oppCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes('/v3/opportunities/opp-1'));
    // Detail query + auto-analysis = at least 2 calls
    expect(oppCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('200 within 10s renders analysis with grade + rationale + NAICS + action', async () => {
    const detail = makeDetail();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(detail),
    } as Response);

    render(<OpportunityDetailPanel opportunityId="opp-1" onBack={vi.fn()} />, { wrapper });

    expect(await screen.findByTestId('analysis-result')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText(/Strong NAICS alignment/)).toBeInTheDocument();
    // NAICS appears in both metadata and analysis sections
    const naicsElements = screen.getAllByText('541512');
    expect(naicsElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Pursue as prime')).toBeInTheDocument();
  });

  it('503 ANALYSIS_TIMEOUT renders retry banner, clicking retry re-fires', async () => {
    const detail = makeDetail();
    const timeoutEnvelope: ErrorEnvelope = {
      success: false,
      error: { code: 'ANALYSIS_TIMEOUT', message: 'Analysis not ready' },
      meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r2' },
    };

    let callCount = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      // First call is the detail query - succeed
      if (callCount === 1) {
        return { ok: true, json: async () => makeEnvelope(detail) } as Response;
      }
      // Second call is auto-analysis - return 503
      if (callCount === 2) {
        return { ok: false, status: 503, json: async () => timeoutEnvelope } as Response;
      }
      // Subsequent calls (retry) - succeed
      return { ok: true, json: async () => makeEnvelope(detail) } as Response;
    });

    render(<OpportunityDetailPanel opportunityId="opp-1" onBack={vi.fn()} />, { wrapper });

    const retryBanner = await screen.findByTestId('retry-banner');
    expect(retryBanner).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    await userEvent.click(retryBtn);

    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('never renders a still_processing or pending state', async () => {
    const detail = makeDetail();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(detail),
    } as Response);

    const { container } = render(<OpportunityDetailPanel opportunityId="opp-1" onBack={vi.fn()} />, { wrapper });

    await screen.findByTestId('opportunity-detail');

    expect(container.textContent).not.toContain('still_processing');
    expect(container.querySelector('[data-status="still_processing"]')).toBeNull();
    expect(container.querySelector('[data-status="pending"]')).toBeNull();
  });
});
