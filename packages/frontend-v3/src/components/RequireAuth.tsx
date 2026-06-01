import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth';

interface RequireAuthProps {
  children: React.ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();

  if (!isAuthenticated()) {
    // Already at /login — do not emit another <Navigate>, which would
    // re-encode the query string on every render and create an infinite
    // redirect loop (the URL changes each cycle, so React never settles).
    if (location.pathname === '/login') {
      return null;
    }

    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}
