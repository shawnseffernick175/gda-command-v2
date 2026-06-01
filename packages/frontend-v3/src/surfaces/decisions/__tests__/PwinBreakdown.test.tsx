import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PwinBreakdown } from '../PwinBreakdown';

const mockScore = {
  score: 72,
  model_version: 'v1-rules',
  feature_weights: [
    { name: 'base', value: 30, description: 'Base score' },
    { name: 'incumbency_bonus', value: 30, description: '+30 incumbency' },
    { name: 'capability_match', value: 15, description: '+15 capability match (scope 50%)' },
    { name: 'vehicle_access', value: 10, description: '+10 vehicle access' },
    { name: 'clearance_fit', value: 5, description: '+5 clearance fit' },
    { name: 'doctrine_bonus', value: 7.5, description: '+7.5 doctrine alignment (30/40)' },
    { name: 'margin_penalty', value: -20, description: '-20 below margin floor' },
  ],
  top_drivers: [
    '+30 incumbency',
    '-20 below margin floor',
    '+15 capability match (scope 50%)',
    '+10 vehicle access',
  ],
  confidence: null,
};

const mockModel = {
  active_version: 'v1-rules',
  model_kind: 'rules',
  trained_at: '2026-05-31T00:00:00Z',
  trained_on_outcomes_count: 0,
  metrics: null,
};

vi.stubGlobal('fetch', vi.fn());

beforeEach(() => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, _init?: RequestInit) => {
    if (url.includes('/pwin/score')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockScore,
          meta: { generatedAt: '2026-05-31T12:00:00Z', source: 'v3', requestId: 'r1' },
        }),
      });
    }
    if (url.includes('/pwin/model')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: mockModel,
          meta: { generatedAt: '2026-05-31T12:00:00Z', source: 'v3', requestId: 'r2' },
        }),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: null, meta: { generatedAt: '2026-05-31T12:00:00Z', source: 'v3', requestId: 'r3' } }),
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

describe('PwinBreakdown', () => {
  it('renders the score', async () => {
    renderWithProviders(<PwinBreakdown opportunityId="opp-1" />);
    expect(await screen.findByText('72%')).toBeTruthy();
  });

  it('renders PWin label', async () => {
    renderWithProviders(<PwinBreakdown opportunityId="opp-1" />);
    expect(await screen.findByText('PWin')).toBeTruthy();
  });

  it('shows narrative text', async () => {
    renderWithProviders(<PwinBreakdown opportunityId="opp-1" />);
    const narrative = await screen.findByTestId('pwin-narrative');
    expect(narrative.textContent).toContain('72%');
    expect(narrative.textContent).toContain('+30 incumbency');
  });

  it('shows top drivers', async () => {
    renderWithProviders(<PwinBreakdown opportunityId="opp-1" />);
    expect(await screen.findByText('+30 incumbency')).toBeTruthy();
    expect(await screen.findByText('-20 below margin floor')).toBeTruthy();
  });

  it('shows model version info', async () => {
    renderWithProviders(<PwinBreakdown opportunityId="opp-1" />);
    expect(await screen.findByText(/Scored by v1-rules/)).toBeTruthy();
  });

  it('shows score contributions', async () => {
    renderWithProviders(<PwinBreakdown opportunityId="opp-1" />);
    const contributions = await screen.findByTestId('pwin-contributions');
    expect(contributions).toBeTruthy();
  });

  it('renders without crash when top_drivers and feature_weights are missing', async () => {
    const sparseScore = { score: 55, model_version: 'v1-rules', confidence: null };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes('/pwin/score')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: sparseScore,
            meta: { generatedAt: '2026-06-01T00:00:00Z', source: 'v3', requestId: 'r-sparse' },
          }),
        });
      }
      if (url.includes('/pwin/model')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            success: true,
            data: mockModel,
            meta: { generatedAt: '2026-06-01T00:00:00Z', source: 'v3', requestId: 'r-model' },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: null, meta: { generatedAt: '2026-06-01T00:00:00Z', source: 'v3', requestId: 'r-fallback' } }),
      });
    });

    renderWithProviders(<PwinBreakdown opportunityId="opp-sparse" />);

    expect(await screen.findByText('55%')).toBeTruthy();

    const narrative = await screen.findByTestId('pwin-narrative');
    expect(narrative.textContent).toContain('55%');

    const breakdown = await screen.findByTestId('pwin-breakdown');
    expect(breakdown).toBeTruthy();
  });
});
