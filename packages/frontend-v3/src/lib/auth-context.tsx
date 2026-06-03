"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
  getToken,
  setToken,
  type AuthUser,
} from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthState = { user: AuthUser | null; loading: boolean };

let authState: AuthState = { user: null, loading: !!getToken() };
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot(): AuthState {
  return authState;
}

function setAuthState(next: AuthState) {
  authState = next;
  notifyListeners();
}

let initPromise: Promise<void> | null = null;

function initAuth(): Promise<void> {
  if (initPromise) return initPromise;
  if (!getToken()) {
    setAuthState({ user: null, loading: false });
    initPromise = Promise.resolve();
    return initPromise;
  }
  initPromise = apiMe()
    .then((u) => setAuthState({ user: u, loading: false }))
    .catch(() => {
      setToken(null);
      setAuthState({ user: null, loading: false });
    });
  return initPromise;
}

// kick off immediately on module load if token exists
void initAuth();

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [, forceRender] = useState(0);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await apiLogin(email, password);
    setAuthState({ user: u, loading: false });
    forceRender((c) => c + 1);
  }, [forceRender]);

  const logout = useCallback(async () => {
    await apiLogout();
    setAuthState({ user: null, loading: false });
    forceRender((c) => c + 1);
  }, [forceRender]);

  return (
    <AuthContext.Provider
      value={{ user: state.user, loading: state.loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
