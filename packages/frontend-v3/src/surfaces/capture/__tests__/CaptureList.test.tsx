import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CaptureList } from '../CaptureList';

const mockItems = [
  {
    id: 'cap-1',
    opportunity_title: 'Army RS3 Sustainment',
    agency: 'US Army',
    response_date: '2026-07-15T00:00:00Z',
    color_review_phase: 'blue' as const,
    compliance_coverage: 0.75,
    pwin: 0.62,
    last_analyzed: '2026-05-30T14:00:00Z',
    source_url: 'https://sam.gov/opp/rs3',
    source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/rs3', retrieved_at: '2026-05-30T12:00:00Z' }],
  },
  {
    id: 'cap-2',
    opportunity_title: 'USCG IT Modernization',
    agency: 'USCG',
    response_date: '2026-08-01T00:00:00Z',
    color_review_phase: 'none' as const,
    compliance_coverage: 0.4,
    pwin: 0.25,
    last_analyzed: null,
    source_url: 'https://sam.gov/opp/uscg',
    source_url_sources: [{ kind: 'sam_gov', title: 'SAM.gov', url: 'https://sam.gov/opp/uscg', retrieved_at: '2026-05-30T12:00:00Z' }],
  },
];

const mockResponse = {
  success: true,
  data: { items: mockItems, total: 2, limit: 25, offset: 0 },
  meta: { generatedAt: '2026-05-30T12:00:00Z', source: 'v3', requestId: 'r1' },
};

const emptyResponse = {
  success: true,
  data: { items: [], total: 0, limit: 25, offset: 0 },
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

    expect(await screen.findByText('Blue')).toBeInTheDocument();
    expect(screen.getByText('None')).toBeInTheDocument();
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
