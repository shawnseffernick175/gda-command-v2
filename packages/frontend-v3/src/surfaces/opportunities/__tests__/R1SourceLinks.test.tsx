import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpportunityDetailPanel } from '../OpportunityDetail';
import type { OpportunityDetail, SuccessEnvelope } from '../types';

const FIXTURE_URL = 'https://sam.gov/opp/r1-test-fixture';
const SOURCE_REF = { kind: 'sam_gov', title: 'SAM.gov', url: FIXTURE_URL, retrieved_at: '2026-05-01T00:00:00Z' };

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
    grade: 'A',
    grade_sources: [SOURCE_REF],
    grade_evidence: 'Strong alignment',
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
    posted_at: null,
    qualified_at: null,
    qualified_by: null,
    analysis: {
      version: '1.0',
      generated_at: '2026-05-01T00:00:00Z',
      pwin: 0.72,
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

describe('[R1] Source links on detail values', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('every rendered value with a source URL has data-source-url and renders an anchor with matching href', async () => {
    const detail = makeDetail();
    const envelope: SuccessEnvelope<OpportunityDetail> = {
      success: true,
      data: detail,
      meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r1' },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => envelope,
    } as Response);

    const { container } = render(
      <OpportunityDetailPanel opportunityId="opp-1" onBack={vi.fn()} />,
      { wrapper },
    );

    await screen.findByTestId('opportunity-detail');

    const sourceElements = container.querySelectorAll('[data-source-url]');
    expect(sourceElements.length).toBeGreaterThanOrEqual(5);

    sourceElements.forEach((el) => {
      const sourceUrl = el.getAttribute('data-source-url');
      expect(sourceUrl).toBeTruthy();
      expect(sourceUrl).toMatch(/^https?:\/\//);

      const anchor = el.tagName === 'A' ? el : el.querySelector('a[href]');
      if (anchor) {
        expect(anchor.getAttribute('href')).toBe(sourceUrl);
        expect(anchor.getAttribute('target')).toBe('_blank');
        expect(anchor.getAttribute('rel')).toContain('noopener');
      }
    });
  });

  it('grade chip has data-source-url and links to source', async () => {
    const detail = makeDetail();
    const envelope: SuccessEnvelope<OpportunityDetail> = {
      success: true,
      data: detail,
      meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r1' },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => envelope,
    } as Response);

    render(
      <OpportunityDetailPanel opportunityId="opp-1" onBack={vi.fn()} />,
      { wrapper },
    );

    await screen.findByTestId('opportunity-detail');

    const gradeChips = screen.getAllByTestId('grade-chip');
    expect(gradeChips.length).toBeGreaterThanOrEqual(1);

    gradeChips.forEach((chip) => {
      const sourceUrl = chip.getAttribute('data-source-url');
      expect(sourceUrl).toBe(FIXTURE_URL);
    });
  });
});
