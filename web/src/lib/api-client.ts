import { i18n } from '@lingui/core';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('milmil-token');
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // The UI language the page is rendering in; the API localizes titles
      // and synopses to it ahead of the server-wide appearance.language.
      ...(i18n.locale ? { 'X-Milmil-Locale': i18n.locale } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/// Absolute URL for a server-relative path (images the browser loads itself).
export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

/// Multipart PUT: no JSON content type, the browser sets the boundary.
async function putForm<T>(path: string, body: FormData): Promise<T> {
  const token = localStorage.getItem('milmil-token');
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    body,
    headers: {
      ...(i18n.locale ? { 'X-Milmil-Locale': i18n.locale } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  putForm,
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
