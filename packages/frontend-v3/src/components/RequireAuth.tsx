import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from '../lib/auth';

interface RequireAuthProps {
  children: React.ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();

  if (!isAuthenticated()) {
    // Already at /login — render nothing to avoid an infinite redirect loop
    // (each Navigate re-encodes the search params, producing a new URL every time).
    if (location.pathname === '/login') return null;

    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}
