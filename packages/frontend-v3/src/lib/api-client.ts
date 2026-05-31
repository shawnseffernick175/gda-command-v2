const API_BASE = import.meta.env.VITE_V3_API_URL || 'https://gda-v3.csr-llc.tech';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const json = await res.json() as { success: boolean; data: T; error?: string; meta?: { requestId?: string } };

  if (!res.ok || !json.success) {
    throw new ApiError(
      json.error || `Request failed with status ${res.status}`,
      res.status,
      json.meta?.requestId,
    );
  }

  return json.data;
}
