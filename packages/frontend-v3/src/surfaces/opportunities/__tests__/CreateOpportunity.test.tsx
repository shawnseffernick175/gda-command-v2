import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OpportunityCreateDrawer } from '../OpportunityCreateDrawer';
import type { OpportunitySummary, SuccessEnvelope } from '../types';

const SOURCE_REF = { kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/test', retrieved_at: '2026-05-01T00:00:00Z' };

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

describe('Create opportunity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submit form fires POST /v3/opportunities with form payload', async () => {
    const created: OpportunitySummary = {
      id: 'opp-new',
      title: 'New Opp',
      title_sources: [SOURCE_REF],
      agency: 'Navy',
      agency_sources: [SOURCE_REF],
      naics: '541511',
      naics_sources: [],
      set_aside: null,
      set_aside_sources: [],
      grade: null,
      grade_sources: [],
      status: 'unscored',
      response_due_at: null,
      response_due_at_sources: [],
      value_min: null,
      value_min_sources: [],
      value_max: null,
      value_max_sources: [],
      teaming_flags: [],
      ai_analyzed_at: null,
      analysis_version: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const envelope: SuccessEnvelope<OpportunitySummary> = {
      success: true,
      data: created,
      meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r1' },
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => envelope,
    } as Response);

    const onCreated = vi.fn();
    const onClose = vi.fn();

    render(
      <OpportunityCreateDrawer open onClose={onClose} onCreated={onCreated} />,
      { wrapper },
    );

    await userEvent.type(screen.getByTestId('create-title'), 'New Opp');
    await userEvent.type(screen.getByTestId('create-source'), 'https://sam.gov/opp/new');
    await userEvent.type(screen.getByTestId('create-agency'), 'Navy');

    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    const postCalls = fetchSpy.mock.calls.filter((c) => {
      const opts = c[1] as RequestInit | undefined;
      return String(c[0]).includes('/v3/opportunities') && opts?.method === 'POST';
    });
    expect(postCalls.length).toBe(1);

    const body = JSON.parse(postCalls[0]![1]!.body as string) as Record<string, unknown>;
    expect(body.title).toBe('New Opp');
    expect(body.source).toBe('https://sam.gov/opp/new');
    expect(body.agency).toBe('Navy');
  });

  it('on 200 calls onCreated callback', async () => {
    const created: OpportunitySummary = {
      id: 'opp-new',
      title: 'New Opp',
      title_sources: [],
      agency: null,
      agency_sources: [],
      naics: null,
      naics_sources: [],
      set_aside: null,
      set_aside_sources: [],
      grade: null,
      grade_sources: [],
      status: 'unscored',
      response_due_at: null,
      response_due_at_sources: [],
      value_min: null,
      value_min_sources: [],
      value_max: null,
      value_max_sources: [],
      teaming_flags: [],
      ai_analyzed_at: null,
      analysis_version: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: created,
        meta: { generatedAt: new Date().toISOString(), source: 'v3', requestId: 'r1' },
      }),
    } as Response);

    const onCreated = vi.fn();

    render(
      <OpportunityCreateDrawer open onClose={vi.fn()} onCreated={onCreated} />,
      { wrapper },
    );

    await userEvent.type(screen.getByTestId('create-title'), 'New Opp');
    await userEvent.type(screen.getByTestId('create-source'), 'https://sam.gov/opp/new');
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    // Wait for mutation to complete
    await vi.waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('opp-new');
    });
  });
});
