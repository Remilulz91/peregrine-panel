// Small wrapper around fetch for talking to the Peregrine API.
// The authentication token lives in an httpOnly cookie, which the browser
// sends automatically thanks to `credentials: 'include'`.

/** A user account, as returned by the API. */
export interface ApiUser {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
}

/** An error that carries the HTTP status code returned by the API. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (data as { error?: string }).error ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

interface Credentials {
  email: string;
  password: string;
}

/** The set of API calls used by the interface. */
export const api = {
  setupRequired: () =>
    request<{ setupRequired: boolean }>('/api/auth/setup-required'),

  me: () => request<{ user: ApiUser }>('/api/auth/me'),

  setup: (body: Credentials & { username: string }) =>
    request<{ user: ApiUser }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: Credentials) =>
    request<{ user: ApiUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
};
