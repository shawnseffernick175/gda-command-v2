import { render, screen, fireEvent } from '@testing-library/react';
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
    title: { value: 'Army RS3 Sustainment', source: 'sam_gov' },
    agency: { value: 'US Army', source: 'sam_gov' },
    office: { value: 'CECOM', source: 'govtribe' },
    naics: { value: '541512', source: 'sam_gov' },
    psc: { value: 'D307', source: 'sam_gov' },
    set_aside: { value: 'SDVOSB', source: 'sam_gov' },
    estimated_value_cents: { value: 25000000000, source: 'govwin' },
    posted_at: { value: '2026-05-01T00:00:00Z', source: 'sam_gov' },
    response_due_at: { value: '2026-06-15T00:00:00Z', source: 'govtribe' },
    award_at: { value: null, source: null },
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

function mockOk() {
  vi.mocked(globalThis.fetch).mockImplementation((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr.includes('/opportunities/unified/uo-123')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: mockDetail,
            meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r1' },
          }),
      } as Response);
    }
    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ success: false, error: 'not found' }),
    } as Response);
  });
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
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: { ...mockDetail, conflicts: [] },
              meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r1' },
            }),
        } as Response);
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
});
