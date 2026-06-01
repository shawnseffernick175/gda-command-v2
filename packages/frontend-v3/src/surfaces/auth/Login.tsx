import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setToken, type AuthUser } from '../../lib/auth';

const API_BASE = import.meta.env.VITE_V3_API_URL || 'https://gda-v3.csr-llc.tech';

interface LoginResponse {
  success: boolean;
  data?: {
    token: string;
    user: AuthUser;
  };
  code?: string;
  message?: string;
  retryAfter?: number;
  error?: { code: string; message: string };
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/launchpad';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const lockoutEndRef = useRef<number>(0);
  const isLockedOut = lockoutSeconds > 0;

  // Countdown driven by React lifecycle — the interval is cleaned up on
  // unmount so it can never leak an open handle that keeps the process alive.
  useEffect(() => {
    if (!isLockedOut) return;

    const id = setInterval(() => {
      const remaining = Math.ceil((lockoutEndRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(id);
        setLockoutSeconds(0);
        setError('');
      } else {
        setLockoutSeconds(remaining);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [isLockedOut]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/v3/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json: LoginResponse = await res.json();

      if (res.status === 200 && json.success && json.data) {
        setToken(json.data.token, json.data.user);
        navigate(next, { replace: true });
        return;
      }

      if (res.status === 423) {
        const seconds = json.retryAfter || 900;
        lockoutEndRef.current = Date.now() + seconds * 1000;
        setLockoutSeconds(seconds);
        return;
      }

      if (res.status === 401) {
        setError('Invalid email or password');
        return;
      }

      setError('Cannot reach server. Please try again.');
    } catch {
      setError('Cannot reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleRetry() {
    setError('');
  }

  const isNetworkError = error === 'Cannot reach server. Please try again.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-ink-primary">GDA Command</h1>
          <p className="mt-2 text-sm text-ink-muted">Sign in to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded border border-border bg-surface p-6 space-y-4"
        >
          {lockoutSeconds > 0 && (
            <div className="rounded border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
              Account locked. Try again in {Math.ceil(lockoutSeconds / 60)} min {lockoutSeconds % 60}s.
            </div>
          )}

          {error && !lockoutSeconds && (
            <div className="rounded border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">
              {error}
              {isNetworkError && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="ml-2 underline text-accent hover:text-accent-hover"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-ink-muted mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || lockoutSeconds > 0}
              className="w-full h-8 px-3 rounded border border-border bg-surface-raised text-sm text-ink-primary placeholder:text-ink-dim focus:outline-none focus:border-accent disabled:opacity-50"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-ink-muted mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || lockoutSeconds > 0}
              className="w-full h-8 px-3 rounded border border-border bg-surface-raised text-sm text-ink-primary placeholder:text-ink-dim focus:outline-none focus:border-accent disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading || lockoutSeconds > 0}
            className="w-full h-8 rounded bg-accent text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors duration-[80ms]"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Signing in…
              </span>
            ) : (
              'Sign in'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
