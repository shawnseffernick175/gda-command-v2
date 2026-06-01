import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import { setToken, clearAuth } from '../lib/auth';

beforeEach(() => {
  clearAuth();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) }));
});

function authAndRender(route = '/launchpad') {
  const payload = btoa(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600 }));
  setToken(`h.${payload}.s`, { id: 1, email: 'test@gda.local', display_name: 'Test', role: 'admin' });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NAV_LABELS = ['Launchpad', 'Fast Track', 'Opportunities', 'Awards', 'Capture', 'Pipeline', 'Action Items', 'Regulatory', 'Settings'];

describe('Left Rail navigation', () => {
  it('renders all 9 nav items as links', () => {
    authAndRender();
    for (const label of NAV_LABELS) {
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
  });

  it('marks the current route as active (aria-current="page")', () => {
    authAndRender('/opportunities');
    const link = screen.getByRole('link', { name: /opportunities/i });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark non-active routes', () => {
    authAndRender('/launchpad');
    const link = screen.getByRole('link', { name: /pipeline/i });
    expect(link).not.toHaveAttribute('aria-current');
  });

  it('highlights parent route for nested paths', () => {
    authAndRender('/capture/some-opp-id');
    const link = screen.getByRole('link', { name: /capture/i });
    expect(link).toHaveAttribute('aria-current', 'page');
  });
});
