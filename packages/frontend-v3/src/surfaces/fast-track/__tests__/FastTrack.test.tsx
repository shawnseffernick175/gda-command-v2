import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { FastTrack } from '../FastTrack';

vi.stubGlobal('fetch', vi.fn());

const mockHistoryResponse = {
  success: true,
  data: { items: [], next_cursor: null },
  meta: { requestId: 'r1' },
};

beforeEach(() => {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.includes('/v3/fast-track') && !url.includes('/v3/fast-track/')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockHistoryResponse),
      });
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ success: false, error: 'not found' }) });
  });
});

function renderFastTrack() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/fast-track']}>
        <FastTrack />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FastTrack surface', () => {
  it('renders the page title', () => {
    renderFastTrack();
    expect(screen.getByText('Fast Track')).toBeInTheDocument();
  });

  it('renders the input form with required fields', () => {
    renderFastTrack();
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/naics/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/set-aside/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/place of performance/i)).toBeInTheDocument();
  });

  it('shows empty state in history when no data', async () => {
    renderFastTrack();
    await waitFor(() => {
      expect(screen.getByTestId('history-empty')).toBeInTheDocument();
    });
  });

  it('submit button exists and is enabled by default', () => {
    renderFastTrack();
    const btn = screen.getByRole('button', { name: /triage opportunity/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });
});
