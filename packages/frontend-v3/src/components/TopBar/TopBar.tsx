import { getUser, clearAuth, getToken } from '../../lib/auth';

const API_BASE = import.meta.env.VITE_V3_API_URL || 'https://gda-v3.csr-llc.tech';

export function TopBar() {
  const user = getUser();

  async function handleSignOut() {
    const token = getToken();
    try {
      await fetch(`${API_BASE}/v3/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    } catch {
      // best effort
    }
    clearAuth();
    window.location.href = '/login';
  }

  return (
    <header className="h-12 flex items-center px-4 border-b border-border bg-surface shrink-0">
      <span className="text-sm font-semibold text-ink-primary">GDA Command</span>
      <div className="flex-1" />
      {user && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-muted">{user.display_name}</span>
          <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded border border-border text-ink-dim">
            {user.role}
          </span>
          <button
            onClick={handleSignOut}
            className="text-xs text-ink-muted hover:text-ink-primary transition-colors duration-[80ms]"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
