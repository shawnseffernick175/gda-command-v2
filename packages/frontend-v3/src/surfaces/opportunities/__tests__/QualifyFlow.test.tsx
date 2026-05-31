import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpportunityDetailPanel } from '../OpportunityDetail';
import type { OpportunityDetail, OpportunitySummary, SuccessEnvelope } from '../types';

const SOURCE_REF = { kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/test', retrieved_at: '2026-05-01T00:00:00Z' };

function makeDetail(): OpportunityDetail {
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
    grade: 'B',
    grade_sources: [SOURCE_REF],
    grade_evidence: 'Moderate fit',
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
    sam_notice_id: null,
    sub_agency: null,
    description: 'Test description',
    description_sources: [SOURCE_REF],
    posted_at: '2026-04-15T00:00:00Z',
    qualified_at: null,
    qualified_by: null,
    analysis: {
      version: '1.0',
      generated_at: '2026-05-01T00:00:00Z',
      pwin: 0.55,
      pwin_sources: [SOURCE_REF],
      incumbent: null,
      incumbent_sources: [],
      competitors: [],
      competitors_sources: [],
      blackhat: null,
      blackhat_sources: [],
      wargame: null,
      wargame_sources: [],
      timeline: null,
      timeline_sources: [],
    },
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

describe('Qualify flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('click Qualify opens modal, confirm fires POST /:id/qualify, status updates', async () => {
    const detail = makeDetail();
    const detailEnvelope: SuccessEnvelope<OpportunityDetail> = {
      success: true,
      data: detail,
      meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r1' },
    };

    const qualifiedSummary: OpportunitySummary = {
      ...detail,
      status: 'qualified',
    };

    const qualifyEnvelope: SuccessEnvelope<{ opportunity: OpportunitySummary; teaming_flags: [] }> = {
      success: true,
      data: { opportunity: qualifiedSummary, teaming_flags: [] },
      meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r2' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, json: async () => detailEnvelope } as Response);

    render(<OpportunityDetailPanel opportunityId="opp-1" onBack={vi.fn()} />, { wrapper });

    const qualifyBtn = await screen.findByRole('button', { name: /^qualify$/i });
    await userEvent.click(qualifyBtn);

    // Modal should be open
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Qualify Opportunity')).toBeInTheDocument();

    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => qualifyEnvelope } as Response);

    const confirmBtn = within(dialog).getByRole('button', { name: /confirm qualify/i });
    await userEvent.click(confirmBtn);

    const qualifyCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes('/qualify')
    );
    expect(qualifyCalls.length).toBe(1);
    expect(qualifyCalls[0]?.[1]?.method).toBe('POST');
  });
});
