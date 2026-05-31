import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Launchpad } from '../Launchpad';

const mockSummary = {
  qualified_due_this_week: 3,
  qualified_due_this_week_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/opportunities?status=qualified', retrieved_at: '2026-05-30T12:00:00Z' }],
  pipeline_no_capture: 2,
  pipeline_no_capture_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/pipeline?no_capture=1', retrieved_at: '2026-05-30T12:00:00Z' }],
  captures_color_review_stale: 1,
  captures_color_review_stale_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures?stale_review=1', retrieved_at: '2026-05-30T12:00:00Z' }],
  action_items_open_today: 5,
  action_items_open_today_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/action-items?status=open&due=today', retrieved_at: '2026-05-30T12:00:00Z' }],
  action_items_overdue: 2,
  action_items_overdue_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/action-items?status=open&overdue=1', retrieved_at: '2026-05-30T12:00:00Z' }],
};

const mockFlags = {
  flags: [
    {
      id: 'f1',
      flag_key: 'ciosp3_expired',
      severity: 'critical' as const,
      title: 'CIO-SP3 Expired',
      detail: 'Contract vehicle expired on Apr 29',
      due_date: null,
      doctrine_anchor: 'Alignment',
      source_url: 'https://sam.gov/opp/test',
      source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/test', retrieved_at: '2026-05-30T12:00:00Z' }],
      created_at: '2026-05-29T10:00:00Z',
    },
  ],
  compliance_gaps: 1,
  compliance_gaps_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures?compliance=non_compliant', retrieved_at: '2026-05-30T12:00:00Z' }],
  teaming_unresolved: 0,
  teaming_unresolved_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/opportunities?teaming=unresolved', retrieved_at: '2026-05-30T12:00:00Z' }],
  analysis_timeouts_24h: 0,
  analysis_timeouts_24h_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/metrics?filter=analysis_timeout_24h', retrieved_at: '2026-05-30T12:00:00Z' }],
};

vi.stubGlobal('fetch', vi.fn());

beforeEach(() => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes('/launchpad/summary')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockSummary, meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r1' } }),
      });
    }
    if (url.includes('/launchpad/flags')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: mockFlags, meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r2' } }),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: 'not found' }) });
  });
});

function renderLaunchpad() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/launchpad']}>
        <Launchpad />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Launchpad', () => {
  it('renders the page title', async () => {
    renderLaunchpad();
    expect(screen.getByRole('heading', { name: 'Launchpad' })).toBeInTheDocument();
  });

  it('renders summary cards with values after load', async () => {
    renderLaunchpad();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(await screen.findByText('Qualified \u2014 Due This Week')).toBeInTheDocument();
  });

  it('renders flags after load', async () => {
    renderLaunchpad();
    expect(await screen.findByText('CIO-SP3 Expired')).toBeInTheDocument();
  });

  it('shows skeletons while loading', () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));
    renderLaunchpad();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
