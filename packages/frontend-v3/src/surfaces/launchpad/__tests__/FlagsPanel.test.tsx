import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FlagsPanel } from '../FlagsPanel';
import type { LaunchpadFlagsResult } from '../types';

const mockData: LaunchpadFlagsResult = {
  flags: [
    {
      id: 'f1',
      flag_key: 'ciosp3_expired',
      severity: 'critical',
      title: 'CIO-SP3 Expired',
      detail: 'Contract vehicle expired on Apr 29',
      due_date: null,
      doctrine_anchor: 'Alignment',
      source_url: 'https://sam.gov/opp/test',
      source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/test', retrieved_at: '2026-05-30T12:00:00Z' }],
      created_at: '2026-05-29T10:00:00Z',
    },
    {
      id: 'f2',
      flag_key: 'cmmi_expiring',
      severity: 'warning',
      title: 'CMMI ML3 Expiring',
      detail: 'Expires in 71 days',
      due_date: '2026-08-10T00:00:00Z',
      doctrine_anchor: null,
      source_url: null,
      source_url_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/company-profile/certs', retrieved_at: '2026-05-30T12:00:00Z' }],
      created_at: '2026-05-28T10:00:00Z',
    },
  ],
  compliance_gaps: 1,
  compliance_gaps_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/captures?compliance=non_compliant', retrieved_at: '2026-05-30T12:00:00Z' }],
  teaming_unresolved: 0,
  teaming_unresolved_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/opportunities?teaming=unresolved', retrieved_at: '2026-05-30T12:00:00Z' }],
  analysis_timeouts_24h: 0,
  analysis_timeouts_24h_sources: [{ kind: 'internal', title: 'GDA V3', url: '/v3/metrics?filter=analysis_timeout_24h', retrieved_at: '2026-05-30T12:00:00Z' }],
};

function renderPanel(props?: Partial<Parameters<typeof FlagsPanel>[0]>) {
  return render(
    <FlagsPanel
      data={mockData}
      isLoading={false}
      isError={false}
      error={null}
      refetch={() => {}}
      {...props}
    />,
  );
}

describe('FlagsPanel', () => {
  it('renders rollup values', () => {
    renderPanel();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Compliance Gaps')).toBeInTheDocument();
    expect(screen.getByText('Teaming Unresolved')).toBeInTheDocument();
    expect(screen.getByText('Analysis Timeouts (24h)')).toBeInTheDocument();
  });

  it('renders flag rows', () => {
    renderPanel();
    expect(screen.getByText('CIO-SP3 Expired')).toBeInTheDocument();
    expect(screen.getByText('CMMI ML3 Expiring')).toBeInTheDocument();
  });

  it('shows doctrine anchor chip', () => {
    renderPanel();
    expect(screen.getByText('Alignment')).toBeInTheDocument();
  });

  it('shows empty state when no flags', () => {
    renderPanel({ data: { ...mockData, flags: [] } });
    expect(screen.getByText(/All clear/)).toBeInTheDocument();
  });

  it('shows error state with retry', () => {
    renderPanel({ isError: true, error: new Error('Server error'), data: undefined });
    expect(screen.getByText(/Failed to load flags/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows skeleton when loading', () => {
    const { container } = renderPanel({ data: undefined, isLoading: true });
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders source link for flags with source_url', () => {
    renderPanel();
    const sourceLinks = screen.getAllByTestId('flag-source-link');
    expect(sourceLinks.length).toBeGreaterThanOrEqual(1);
    expect(sourceLinks[0]?.getAttribute('href')).toBe('https://sam.gov/opp/test');
  });
});
