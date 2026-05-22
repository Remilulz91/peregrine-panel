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

/** A game template, as returned by the API. */
export interface ApiTemplate {
  id: string;
  name: string;
  dockerImage: string;
  defaultVersion: string;
}

/** A game server, as returned by the API. */
export interface ApiServer {
  id: string;
  name: string;
  status: string;
  templateId: string;
  minecraftVersion: string;
  memoryMb: number;
  port: number;
  createdAt: string;
}

/** A power action that can be applied to a server. */
export type ServerAction = 'start' | 'stop' | 'restart';

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

interface CreateServerInput {
  name: string;
  templateId: string;
  minecraftVersion?: string;
  memoryMb: number;
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

  listTemplates: () =>
    request<{ templates: ApiTemplate[] }>('/api/templates'),

  listServers: () => request<{ servers: ApiServer[] }>('/api/servers'),

  createServer: (body: CreateServerInput) =>
    request<{ server: ApiServer }>('/api/servers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  deleteServer: (id: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}`, { method: 'DELETE' }),

  /** Starts, stops or restarts a server. */
  serverAction: (id: string, action: ServerAction) =>
    request<{ ok: boolean }>(`/api/servers/${id}/${action}`, {
      method: 'POST',
    }),
};
