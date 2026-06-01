import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DecisionHistory } from '../DecisionHistory';

const mockDecisions = [
  {
    id: 'd1',
    kind: 'qualify',
    entity_kind: 'opportunity',
    entity_id: 'opp-1',
    rationale: 'Strong fit for RS3 scope — logistics + sustainment',
    evidence_refs: [{ source_url: 'https://sam.gov/test', source_type: 'sam_gov', grade: 'A' }],
    doctrine_alignment_score: 35,
    exclusion_triggers: null,
    margin_check: null,
    made_by: 'shawn',
    made_at: '2026-05-30T14:00:00Z',
    outcome: null,
    outcome_recorded_at: null,
    outcome_evidence_refs: null,
    parent_decision_id: null,
    agent_run_id: null,
  },
  {
    id: 'd2',
    kind: 'kill',
    entity_kind: 'opportunity',
    entity_id: 'opp-1',
    rationale: 'Margin too thin after re-evaluation',
    evidence_refs: [],
    doctrine_alignment_score: 20,
    exclusion_triggers: null,
    margin_check: { passed: false, margin_pct: 5, threshold: 10 },
    made_by: 'agent:analysis',
    made_at: '2026-05-31T09:00:00Z',
    outcome: null,
    outcome_recorded_at: null,
    outcome_evidence_refs: null,
    parent_decision_id: 'd1',
    agent_run_id: null,
  },
];

vi.stubGlobal('fetch', vi.fn());

beforeEach(() => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes('/memory/decisions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockDecisions,
          meta: { generatedAt: '2026-05-31T12:00:00Z', source: 'v3', requestId: 'r1' },
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], meta: { generatedAt: '2026-05-31T12:00:00Z', source: 'v3', requestId: 'r2' } }),
    });
  });
});

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
  );
}

describe('DecisionHistory', () => {
  it('renders decision rows', async () => {
    renderWithProviders(<DecisionHistory entityKind="opportunity" entityId="opp-1" />);
    const rows = await screen.findAllByTestId('decision-row');
    expect(rows).toHaveLength(2);
  });

  it('shows rationale text', async () => {
    renderWithProviders(<DecisionHistory entityKind="opportunity" entityId="opp-1" />);
    expect(await screen.findByText(/Strong fit for RS3 scope/)).toBeTruthy();
    expect(await screen.findByText(/Margin too thin/)).toBeTruthy();
  });

  it('shows made_by', async () => {
    renderWithProviders(<DecisionHistory entityKind="opportunity" entityId="opp-1" />);
    expect(await screen.findByText(/by shawn/)).toBeTruthy();
    expect(await screen.findByText(/by agent:analysis/)).toBeTruthy();
  });

  it('shows evidence links', async () => {
    renderWithProviders(<DecisionHistory entityKind="opportunity" entityId="opp-1" />);
    const link = await screen.findByText('sam_gov (A)');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('https://sam.gov/test');
  });
});
