import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CaptureList } from '../CaptureList';

const mockItems = [
  {
    id: 'cap-1',
    pipeline_item_id: 'pi-1',
    pipeline_capture_owner: 'shawn',
    opportunity_title: 'Army RS3 Sustainment',
    opportunity_title_sources: [],
    opportunity_agency: 'US Army',
    opportunity_agency_sources: [],
    color_stage: 'pink' as const,
    pwin: 0.62,
    pwin_sources: [{ kind: 'internal', title: 'GDA Capture Analysis', url: '/v3/captures/cap-1', retrieved_at: '2026-05-30T14:00:00Z' }],
    source_url: '/v3/captures/cap-1',
    ai_analyzed_at: '2026-05-30T14:00:00Z',
    analysis_version: 'v0.0.1',
    created_at: '2026-05-30T12:00:00Z',
    updated_at: '2026-05-30T14:00:00Z',
  },
  {
    id: 'cap-2',
    pipeline_item_id: 'pi-2',
    pipeline_capture_owner: 'shawn',
    opportunity_title: 'USCG IT Modernization',
    opportunity_title_sources: [],
    opportunity_agency: 'USCG',
    opportunity_agency_sources: [],
    color_stage: 'red' as const,
    pwin: 0.25,
    pwin_sources: [{ kind: 'internal', title: 'GDA Capture Analysis', url: '/v3/captures/cap-2', retrieved_at: '2026-05-30T12:00:00Z' }],
    source_url: '/v3/captures/cap-2',
    ai_analyzed_at: null,
    analysis_version: null,
    created_at: '2026-05-30T12:00:00Z',
    updated_at: '2026-05-30T12:00:00Z',
  },
];

const mockResponse = {
  success: true,
  data: { items: mockItems, total: 2, limit: 25, offset: 0, pagination: { limit: 25, cursor: null, hasMore: false } },
  meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r1' },
};

const emptyResponse = {
  success: true,
  data: { items: [], total: 0, limit: 25, offset: 0, pagination: { limit: 25, cursor: null, hasMore: false } },
  meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r2' },
};

vi.stubGlobal('fetch', vi.fn());

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CaptureList', () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockReset();
  });

  it('renders rows from mock response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    render(<CaptureList />, { wrapper });

    expect(await screen.findByText('Army RS3 Sustainment')).toBeInTheDocument();
    expect(screen.getByText('USCG IT Modernization')).toBeInTheDocument();
    expect(screen.getByText('US Army')).toBeInTheDocument();
    expect(screen.getByText('USCG')).toBeInTheDocument();
  });

  it('renders color review chips', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    render(<CaptureList />, { wrapper });

    expect(await screen.findByText('Pink')).toBeInTheDocument();
    expect(screen.getByText('Red')).toBeInTheDocument();
  });

  it('renders pwin chips', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    render(<CaptureList />, { wrapper });

    expect(await screen.findByText('62%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('shows sort indicators on sortable columns', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    render(<CaptureList />, { wrapper });

    await screen.findByText('Army RS3 Sustainment');

    const table = screen.getByRole('grid');
    const headers = within(table).getAllByRole('columnheader');
    const responseDateHeader = headers.find((h) => h.textContent?.includes('Response Date'));
    expect(responseDateHeader).toBeDefined();
  });

  it('renders empty state when no captures', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(emptyResponse),
    } as Response);

    render(<CaptureList />, { wrapper });

    expect(await screen.findByText('No captures found')).toBeInTheDocument();
  });

  it('shows error state on fetch failure', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ success: false, error: 'Server error' }),
    } as Response);

    render(<CaptureList />, { wrapper });

    expect(await screen.findByText('Failed to load captures')).toBeInTheDocument();
  });

  it('supports filter input', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const user = userEvent.setup();
    render(<CaptureList />, { wrapper });

    await screen.findByText('Army RS3 Sustainment');

    const filterInput = screen.getByPlaceholderText('Filter captures...');
    await user.type(filterInput, 'Army');

    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled();
  });

  it('renders pagination when total > page size', async () => {
    const paginatedResponse = {
      ...mockResponse,
      data: { ...mockResponse.data, total: 50 },
    };

    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(paginatedResponse),
    } as Response);

    render(<CaptureList />, { wrapper });

    expect(await screen.findByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.tagName === 'SPAN' && (element?.textContent?.includes('of 50') ?? false))).toBeInTheDocument();
  });
});
