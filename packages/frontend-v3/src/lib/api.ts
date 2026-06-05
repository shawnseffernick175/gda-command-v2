/**
 * lib/api.ts — ONLY networking layer for the GDA frontend.
 * All /v3/* calls go through here. No other file makes HTTP requests.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "https://gda-v3.csr-llc.tech";

/* ── Token storage (in-memory only — never localStorage) ──────── */

let accessToken: string | null = null;

export function getToken(): string | null {
  return accessToken;
}

export function setToken(t: string | null): void {
  accessToken = t;
}

/* ── Envelope types ───────────────────────────────────────────── */

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: { generatedAt: string; source: string; requestId: string };
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; detail: string | null };
  meta: { generatedAt: string; source: string; requestId: string };
}

type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public detail: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/* ── Core fetch wrapper ───────────────────────────────────────── */

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!accessToken) return false;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/v3/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) return false;
      const envelope = (await res.json()) as SuccessEnvelope<{ token: string }>;
      if (envelope.success) {
        accessToken = envelope.data.token;
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    }
  }

  const envelope = (await res.json()) as Envelope<T>;

  if (!envelope.success) {
    const err = envelope as ErrorEnvelope;
    throw new ApiError(
      err.error.code,
      err.error.message,
      res.status,
      err.error.detail,
    );
  }

  return (envelope as SuccessEnvelope<T>).data;
}

/* ── Typed helpers ────────────────────────────────────────────── */

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  let url = path;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }
  return apiFetch<T>(url, { method: "GET" });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  return apiFetch<T>(path, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete(path: string): Promise<void> {
  await apiFetch<void>(path, { method: "DELETE" });
}

/* ── Auth helpers ─────────────────────────────────────────────── */

export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  role: string;
  is_active?: boolean;
  last_login_at?: string;
  created_at?: string;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const data = await apiPost<LoginResponse>("/v3/auth/login", {
    email,
    password,
  });
  accessToken = data.token;
  return data;
}

export async function me(): Promise<AuthUser> {
  return apiGet<AuthUser>("/v3/auth/me");
}

export async function logout(): Promise<void> {
  try {
    await apiPost<void>("/v3/auth/logout");
  } finally {
    accessToken = null;
  }
}
