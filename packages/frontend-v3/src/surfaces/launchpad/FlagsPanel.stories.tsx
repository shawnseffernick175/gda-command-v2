import type { Meta, StoryObj } from '@storybook/react';
import { FlagsPanel } from './FlagsPanel';
import type { LaunchpadFlagsResult } from './types';

const mockData: LaunchpadFlagsResult = {
  flags: [
    {
      id: 'f1',
      flag_key: 'ciosp3_expired',
      severity: 'critical',
      title: 'CIO-SP3 Expired',
      detail: 'Contract vehicle CIO-SP3 expired on April 29, 2026. Immediate renewal or transition needed.',
      due_date: null,
      doctrine_anchor: 'Alignment',
      source_url: 'https://sam.gov/opp/ciosp3-renewal',
      source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/ciosp3-renewal', retrieved_at: '2026-05-30T12:00:00Z' }],
      created_at: '2026-05-29T10:00:00Z',
    },
    {
      id: 'f2',
      flag_key: 'cmmi_expiring',
      severity: 'warning',
      title: 'CMMI ML3 Expiring in 71 Days',
      detail: 'Certification expires Aug 10, 2026. Schedule reappraisal.',
      due_date: '2026-08-10T00:00:00Z',
      doctrine_anchor: 'Ethics Always',
      source_url: null,
      source_url_sources: [{ kind: 'internal', title: 'Company Profile', url: '/v3/company-profile/certs', retrieved_at: '2026-05-30T12:00:00Z' }],
      created_at: '2026-05-28T10:00:00Z',
    },
    {
      id: 'f3',
      flag_key: 'mentor_protege_urgent',
      severity: 'info',
      title: 'Mentor-Protege Agreement Requires Action',
      detail: null,
      due_date: '2026-06-02T00:00:00Z',
      doctrine_anchor: 'Teamwork',
      source_url: null,
      source_url_sources: [],
      created_at: '2026-05-27T10:00:00Z',
    },
  ],
  compliance_gaps: 2,
  compliance_gaps_sources: [{ kind: 'internal', title: 'GDA V3 — compliance', url: '/v3/captures?compliance=non_compliant', retrieved_at: '2026-05-30T12:00:00Z' }],
  teaming_unresolved: 1,
  teaming_unresolved_sources: [{ kind: 'internal', title: 'GDA V3 — teaming', url: '/v3/opportunities?teaming=unresolved', retrieved_at: '2026-05-30T12:00:00Z' }],
  analysis_timeouts_24h: 0,
  analysis_timeouts_24h_sources: [{ kind: 'internal', title: 'GDA V3 — timeouts', url: '/v3/metrics?filter=analysis_timeout_24h', retrieved_at: '2026-05-30T12:00:00Z' }],
};

const meta: Meta<typeof FlagsPanel> = {
  title: 'Surfaces/Launchpad/FlagsPanel',
  component: FlagsPanel,
};

export default meta;
type Story = StoryObj<typeof FlagsPanel>;

export const Default: Story = {
  args: { data: mockData, isLoading: false, isError: false, error: null, refetch: () => {} },
};

export const Empty: Story = {
  args: { data: { ...mockData, flags: [] }, isLoading: false, isError: false, error: null, refetch: () => {} },
};

export const Loading: Story = {
  args: { data: undefined, isLoading: true, isError: false, error: null, refetch: () => {} },
};

export const Error: Story = {
  args: { data: undefined, isLoading: false, isError: true, error: new globalThis.Error('Server error'), refetch: () => {} },
};
