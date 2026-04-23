// ============================================================
// Fetch wrapper for calling the NestJS backend API
// ============================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export class ApiRequestError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface FetchOptions extends Omit<RequestInit, 'headers'> {
  token?: string;
  headers?: Record<string, string>;
}

/**
 * Generic fetch wrapper that handles the API envelope and error extraction.
 * Works on both server and client.
 */
export async function apiFetch<T>(
  endpoint: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers,
    ...rest,
  });

  const json = await res.json();

  if (!res.ok || json.success === false) {
    const code = json.error?.code || `HTTP_${res.status}`;
    const message = json.error?.message || json.message || res.statusText;
    throw new ApiRequestError(code, message, res.status);
  }

  return json.data as T;
}

/**
 * Server-side fetch for SSR pages — no auth needed, adds cache control.
 */
export async function serverFetch<T>(
  endpoint: string,
  revalidate: number = 0,
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    next: { revalidate },
  });

  const json = await res.json();

  if (!res.ok || json.success === false) {
    const code = json.error?.code || `HTTP_${res.status}`;
    const message = json.error?.message || res.statusText;
    throw new ApiRequestError(code, message, res.status);
  }

  return json as T;
}
