import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Login } from '../surfaces/auth/Login';
import { RequireAuth } from '../components/RequireAuth';
import { clearAuth, setToken } from '../lib/auth';

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  clearAuth();
  mockFetch.mockReset();
  // Reset location mock
  Object.defineProperty(window, 'location', {
    writable: true,
    value: { href: '/', pathname: '/' },
  });
});

describe('Login surface', () => {
  it('submits correct payload', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          token: 'test-token',
          user: { id: 1, email: 'test@gda.local', display_name: 'Test', role: 'admin' },
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'test@gda.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v3/auth/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'test@gda.local', password: 'secret123' }),
        }),
      );
    });
  });

  it('401 response shows generic error and does not store token', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'bad@gda.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
    expect(localStorage.getItem('gda_v3_token')).toBeNull();
  });

  it('200 response stores token and redirects', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        success: true,
        data: {
          token: 'new-token-123',
          user: { id: 1, email: 'admin@gda.local', display_name: 'Admin', role: 'admin' },
        },
      }),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@gda.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem('gda_v3_token')).toBe('new-token-123');
    });
  });

  it('423 shows lockout message with countdown', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 423,
      json: async () => ({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: 'Account locked',
        retryAfter: 120,
      }),
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Login />
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'locked@gda.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'any');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/account locked/i)).toBeInTheDocument();
    });
  });
});

describe('RequireAuth', () => {
  it('redirects unauthenticated users to /login', () => {
    render(
      <MemoryRouter initialEntries={['/launchpad']}>
        <RequireAuth>
          <div>Protected</div>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Protected')).not.toBeInTheDocument();
  });

  it('renders children for authenticated users', () => {
    // Set a valid token (expires 1h from now)
    const payload = btoa(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600 }));
    const fakeToken = `header.${payload}.signature`;
    setToken(fakeToken, { id: 1, email: 'test@gda.local', display_name: 'Test', role: 'admin' });

    render(
      <MemoryRouter initialEntries={['/launchpad']}>
        <RequireAuth>
          <div>Protected</div>
        </RequireAuth>
      </MemoryRouter>,
    );
    expect(screen.getByText('Protected')).toBeInTheDocument();
  });
});

describe('API client 401 handling', () => {
  it('401 from any API call clears auth and redirects', async () => {
    // Set token first
    const payload = btoa(JSON.stringify({ sub: '1', exp: Math.floor(Date.now() / 1000) + 3600 }));
    const fakeToken = `header.${payload}.signature`;
    setToken(fakeToken, { id: 1, email: 'test@gda.local', display_name: 'Test', role: 'admin' });

    mockFetch.mockResolvedValueOnce({
      status: 401,
      ok: false,
      json: async () => ({
        success: false,
        error: 'Session expired',
        code: 'UNAUTHORIZED',
        meta: { requestId: 'req-1' },
      }),
    });

    const { apiFetch } = await import('../lib/api-client');
    await expect(apiFetch('/v3/launchpad/summary')).rejects.toThrow('Session expired');

    expect(localStorage.getItem('gda_v3_token')).toBeNull();
    expect(window.location.href).toBe('/login?reason=expired');
  });
});
