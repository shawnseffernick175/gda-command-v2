/**
 * Auth client — handles login/register/refresh/logout and token storage.
 */

import { AUTH_BASE } from "./config";
import { recordFetchResult, recordFetchError } from "./soakReporter";
const API_BASE = AUTH_BASE;

interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface GDAEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

// Token storage
const TOKEN_KEY = "gda_access_token";
const REFRESH_KEY = "gda_refresh_token";
const USER_KEY = "gda_user";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

function saveAuth(data: AuthResponse): void {
  localStorage.setItem(TOKEN_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

async function authRequest<T>(
  path: string,
  body: Record<string, string>
): Promise<GDAEnvelope<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<GDAEnvelope<T>>;
}

export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  const res = await authRequest<AuthResponse>("/login", { email, password });
  if (res.success && res.data) {
    saveAuth(res.data);
    return { success: true };
  }
  return { success: false, error: res.error?.message ?? "Login failed" };
}

export async function register(
  email: string,
  password: string,
  display_name: string
): Promise<{ success: boolean; error?: string }> {
  const res = await authRequest<AuthResponse>("/register", {
    email,
    password,
    display_name,
  });
  if (res.success && res.data) {
    saveAuth(res.data);
    return { success: true };
  }
  return { success: false, error: res.error?.message ?? "Registration failed" };
}

export async function refreshTokens(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;

  const res = await authRequest<AuthResponse>("/refresh", { refreshToken });
  if (res.success && res.data) {
    saveAuth(res.data);
    return true;
  }

  clearAuth();
  return false;
}

export async function logout(): Promise<void> {
  const token = getAccessToken();
  if (token) {
    await fetch(`${API_BASE}/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }).catch(() => {});
  }
  clearAuth();
}

/**
 * Fetch wrapper that adds Authorization header and handles token refresh.
 * If refresh fails, redirects to login — never returns a raw 401 to the UI.
 */
let _refreshPromise: Promise<boolean> | null = null;

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const startMs = performance.now();

  let res: Response;
  try {
    res = await fetch(input, { ...init, headers });
  } catch (err) {
    recordFetchError(url, err instanceof Error ? err.message : String(err));
    throw err;
  }

  // Auto-refresh on 401
  if (res.status === 401 && token) {
    // Coalesce concurrent refresh attempts
    if (!_refreshPromise) {
      _refreshPromise = refreshTokens().finally(() => { _refreshPromise = null; });
    }
    const refreshed = await _refreshPromise;
    if (refreshed) {
      const newToken = getAccessToken();
      if (newToken) {
        headers.set("Authorization", `Bearer ${newToken}`);
        res = await fetch(input, { ...init, headers });
      }
    } else {
      // Refresh failed — session expired, redirect to login
      clearAuth();
      if (window.location.pathname !== "/login") {
        window.location.href = "/";
      }
      recordFetchResult(url, res.status, startMs);
      return res;
    }
  }

  recordFetchResult(url, res.status, startMs);
  return res;
}
