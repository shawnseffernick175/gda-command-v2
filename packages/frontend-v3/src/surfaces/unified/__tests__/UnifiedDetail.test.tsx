import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { UnifiedDetail } from '../UnifiedDetail';

const mockDetail = {
  internal_id: 'uo-123',
  lifecycle_stage: 'solicitation',
  primary_source: 'sam_gov',
  pwin: 0.55,
  doctrine_status: 'matched',
  created_at: '2026-05-01T12:00:00Z',
  updated_at: '2026-05-30T12:00:00Z',
  merged_fields: {
    title: {
      value: 'Army RS3 Sustainment',
      source: 'sam_gov',
      sources: [
        {
          kind: 'sam_gov',
          title: 'SAM.gov',
          url: 'https://sam.gov/opp/sam-abc/view',
          retrieved_at: '2026-05-02T12:00:00Z',
        },
      ],
    },
    agency: {
      value: 'US Army',
      source: 'sam_gov',
      sources: [
        {
          kind: 'sam_gov',
          title: 'SAM.gov',
          url: 'https://sam.gov/opp/sam-abc/view',
          retrieved_at: '2026-05-02T12:00:00Z',
        },
      ],
    },
    office: {
      value: 'CECOM',
      source: 'govtribe',
      sources: [
        {
          kind: 'govtribe',
          title: 'GovTribe',
          url: 'https://govtribe.com/opportunity/federal-contract-opportunity/gt-xyz',
          retrieved_at: '2026-05-04T12:00:00Z',
        },
      ],
    },
    naics: { value: '541512', source: 'sam_gov', sources: [] },
    psc: { value: 'D307', source: 'sam_gov', sources: [] },
    set_aside: { value: 'SDVOSB', source: 'sam_gov', sources: [] },
    estimated_value_cents: { value: 25000000000, source: 'govwin', sources: [] },
    posted_at: { value: '2026-05-01T00:00:00Z', source: 'sam_gov', sources: [] },
    response_due_at: { value: '2026-06-15T00:00:00Z', source: 'govtribe', sources: [] },
    award_at: { value: null, source: null, sources: [] },
  },
  sources: [
    { source: 'sam_gov', response_due_at: '2026-06-15T00:00:00Z' },
    { source: 'govtribe', response_due_at: '2026-06-20T00:00:00Z' },
  ],
  conflicts: [
    {
      field: 'response_due_at',
      values: [
        { source: 'sam_gov', value: '2026-06-15T00:00:00Z' },
        { source: 'govtribe', value: '2026-06-20T00:00:00Z' },
      ],
      chosen: 'govtribe',
    },
  ],
  lineage: [
    {
      source: 'sam_gov',
      source_native_id: 'sam-abc',
      confidence: 'CONFIRMED',
      match_method: 'exact_notice_id',
      matched_at: '2026-05-02T12:00:00Z',
      confirmed_by: 'shawn',
      confirmed_at: '2026-05-03T12:00:00Z',
    },
    {
      source: 'govtribe',
      source_native_id: 'gt-xyz',
      confidence: 'MEDIUM',
      match_method: 'fuzzy_title',
      matched_at: '2026-05-04T12:00:00Z',
      confirmed_by: null,
      confirmed_at: null,
    },
  ],
};

vi.stubGlobal('fetch', vi.fn());

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/unified/uo-123']}>
        <Routes>
          <Route path="/unified/:internal_id" element={children} />
          <Route path="/opportunities" element={<div>List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function envelope(data: unknown) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r1' },
      }),
  } as Response;
}

function mockOk() {
  vi.mocked(globalThis.fetch).mockImplementation(
    (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      // R2: the analyze endpoint returns the refreshed unified detail.
      if (urlStr.includes('/opportunities/unified/uo-123/analyze')) {
        expect(init?.method).toBe('POST');
        return Promise.resolve(envelope(mockDetail));
      }
      if (urlStr.includes('/opportunities/unified/uo-123')) {
        return Promise.resolve(envelope(mockDetail));
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'not found' }),
      } as Response);
    },
  );
}

describe('UnifiedDetail', () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockReset();
  });

  it('renders the title and merged fields with provenance', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    // Title appears in both the page header and as the merged `title` field.
    expect((await screen.findAllByText('Army RS3 Sustainment')).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Army RS3 Sustainment' })).toBeInTheDocument();
    expect(screen.getByText('US Army')).toBeInTheDocument();
    expect(screen.getByText('CECOM')).toBeInTheDocument();
    // provenance "via <source>" is rendered for fields that have a source
    expect(screen.getAllByTestId('field-source').length).toBeGreaterThan(0);
    expect(screen.getAllByText('via govtribe').length).toBeGreaterThan(0);
  });

  it('renders a source badge strip with one badge per distinct source', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    const strip = await screen.findByTestId('source-badge-strip');
    expect(strip).toHaveTextContent('sam_gov');
    expect(strip).toHaveTextContent('govtribe');
  });

  it('renders the lineage trail and stage chip', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    expect(await screen.findByTestId('lineage-trail')).toBeInTheDocument();
    expect(screen.getByTestId('stage-chip')).toHaveTextContent('Solicitation');
  });

  it('shows the conflict count and opens the conflict drawer on click', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    const toggle = await screen.findByTestId('conflict-count-toggle');
    expect(toggle).toHaveTextContent('1 field conflict across');

    // drawer hidden initially
    expect(screen.queryByTestId('conflict-drawer')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(await screen.findByTestId('conflict-drawer')).toBeInTheDocument();
    const list = screen.getByTestId('conflict-list');
    // both source values shown, and the chosen one labeled
    expect(list).toHaveTextContent('sam_gov');
    expect(list).toHaveTextContent('govtribe');
    expect(list).toHaveTextContent('chosen');
  });

  it('renders the lineage table with confidence and match metadata', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    const table = await screen.findByTestId('lineage-table');
    expect(table).toHaveTextContent('sam-abc');
    expect(table).toHaveTextContent('gt-xyz');
    expect(table).toHaveTextContent('exact_notice_id');
    expect(table).toHaveTextContent('Confirmed by shawn');
  });

  it('formats estimated value as currency', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    expect(await screen.findByText('$250,000,000')).toBeInTheDocument();
  });

  it('shows an em-dash for null fields (award_at)', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    await screen.findAllByText('Army RS3 Sustainment');
    // award_at value is null -> em dash present somewhere in merged fields
    expect(screen.getAllByText('\u2014').length).toBeGreaterThan(0);
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ success: false, error: 'Not found' }),
    } as Response);

    render(<UnifiedDetail />, { wrapper });

    expect(await screen.findByText('Failed to load opportunity')).toBeInTheDocument();
  });

  it('renders "No field conflicts" when conflicts is empty', async () => {
    vi.mocked(globalThis.fetch).mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/opportunities/unified/uo-123')) {
        return Promise.resolve(envelope({ ...mockDetail, conflicts: [] }));
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ success: false, error: 'not found' }),
      } as Response);
    });

    render(<UnifiedDetail />, { wrapper });

    expect(await screen.findByText('No field conflicts')).toBeInTheDocument();
    expect(screen.queryByTestId('conflict-count-toggle')).not.toBeInTheDocument();
  });

  // ─── F-420a (R1): clickable source links ──────────────────────────────────

  it('renders fields with a clickable source URL as an external link (R1)', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    // The title field is sam_gov-sourced and carries a SAM.gov URL.
    const titleLink = await screen.findByTestId('field-value-title');
    expect(titleLink.tagName).toBe('A');
    expect(titleLink).toHaveAttribute('href', 'https://sam.gov/opp/sam-abc/view');
    expect(titleLink).toHaveAttribute('target', '_blank');
    expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer');

    // The office field is govtribe-sourced and links to GovTribe.
    const officeLink = screen.getByTestId('field-value-office');
    expect(officeLink.tagName).toBe('A');
    expect(officeLink).toHaveAttribute(
      'href',
      'https://govtribe.com/opportunity/federal-contract-opportunity/gt-xyz',
    );
  });

  it('renders fields without a source URL as plain text, not a link (R1)', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    // naics has source sam_gov but an empty sources[] -> no addressable URL.
    const naicsValue = await screen.findByTestId('field-value-naics');
    expect(naicsValue.tagName).toBe('SPAN');
    expect(naicsValue).not.toHaveAttribute('href');
  });

  // ─── F-420a (R2): auto-analysis on mount ──────────────────────────────────

  it('auto-triggers the analyze endpoint via POST on mount (R2)', async () => {
    mockOk();
    render(<UnifiedDetail />, { wrapper });

    // Wait for the page to settle (detail loaded).
    await screen.findAllByText('Army RS3 Sustainment');

    await waitFor(() => {
      const calls = vi.mocked(globalThis.fetch).mock.calls;
      const analyzeCall = calls.find(([url]) => {
        const u = typeof url === 'string' ? url : (url as URL | Request).toString();
        return u.includes('/opportunities/unified/uo-123/analyze');
      });
      expect(analyzeCall).toBeDefined();
      expect((analyzeCall?.[1] as RequestInit | undefined)?.method).toBe('POST');
    });
  });
});
