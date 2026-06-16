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

/* ── Redirect helper (works in both App Router and plain contexts) ── */

function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

/* ── Core fetch wrapper ───────────────────────────────────────── */

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/v3/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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

/**
 * Attempt to restore the session from the httpOnly refresh cookie.
 * Called once on app boot (before any other API call).
 * Returns the new access token on success, null if no valid session.
 */
export async function bootRefresh(): Promise<string | null> {
  const ok = await tryRefresh();
  return ok ? accessToken : null;
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

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    } else {
      // No valid session — redirect silently, do not throw into TanStack Query
      accessToken = null;
      redirectToLogin();
      throw new ApiError("UNAUTHORIZED", "Session expired", 401);
    }
  }

  const contentType = res.headers.get("Content-Type") ?? "";

  // SSE / streaming responses: collect the stream, parse last SSE data payload
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    return parseSSEResponse<T>(text, res.status);
  }

  // Defensive: an upstream proxy, SPA fallback, or gateway error can return
  // an HTML body (e.g. "<html>...") instead of our JSON envelope. Calling
  // res.json() on that throws a cryptic "Unexpected token '<'" SyntaxError.
  // Detect a non-JSON body and surface a clean, actionable ApiError instead.
  let envelope: Envelope<T>;
  if (!contentType.includes("application/json")) {
    const body = await res.text();
    const snippet = body.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new ApiError(
      res.ok ? "BAD_RESPONSE" : "UPSTREAM_ERROR",
      res.ok
        ? "Server returned a non-JSON response"
        : `Request failed (${res.status})`,
      res.status,
      snippet || null,
    );
  }
  try {
    envelope = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(
      "BAD_RESPONSE",
      "Server returned an invalid response",
      res.status,
      null,
    );
  }

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

/**
 * Parse accumulated SSE text into the final data payload.
 * Extracts the last complete JSON object from `data:` lines.
 */
function parseSSEResponse<T>(raw: string, status: number): T {
  const lines = raw.split("\n");
  let lastData: string | null = null;

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      lastData = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      lastData = line.slice(5).trim();
    }
  }

  if (!lastData) {
    throw new ApiError(
      "SSE_EMPTY",
      "No data received from streaming response",
      status,
    );
  }

  try {
    const parsed = JSON.parse(lastData) as Record<string, unknown>;
    // If the parsed object follows the envelope pattern, unwrap it
    if ("success" in parsed && parsed.success === true && "data" in parsed) {
      return (parsed as unknown as SuccessEnvelope<T>).data;
    }
    if ("success" in parsed && parsed.success === false) {
      const err = parsed as unknown as ErrorEnvelope;
      throw new ApiError(
        err.error.code,
        err.error.message,
        status,
        err.error.detail,
      );
    }
    // Agent responses may not follow envelope pattern — return as-is
    return parsed as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      "SSE_PARSE_ERROR",
      "Failed to parse streaming response",
      status,
    );
  }
}

/* ── Typed helpers ────────────────────────────────────────────── */

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | string[] | undefined>,
): Promise<T> {
  let url = path;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) sp.append(k, item);
      } else {
        sp.set(k, String(v));
      }
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }
  return apiFetch<T>(url, { method: "GET" });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal },
): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
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
  const res = await fetch(`${API_BASE}/v3/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const envelope = (await res.json()) as Envelope<LoginResponse>;
  if (!envelope.success) {
    const err = envelope as ErrorEnvelope;
    throw new ApiError(err.error.code, err.error.message, res.status, err.error.detail);
  }
  const data = (envelope as SuccessEnvelope<LoginResponse>).data;
  accessToken = data.token;
  return data;
}

export async function me(): Promise<AuthUser> {
  return apiGet<AuthUser>("/v3/auth/me");
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/v3/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: "include",
    });
  } finally {
    accessToken = null;
  }
}
