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
  /** "java" or "bedrock". */
  kind: string;
}

/** A game server, as returned by the API. */
export interface ApiServer {
  id: string;
  name: string;
  status: string;
  templateId: string;
  minecraftVersion: string;
  memoryMb: number;
  cpuLimit: number;
  port: number;
  createdAt: string;
}

/** A game server as seen from the admin view (includes the owner). */
export interface ApiAdminServer extends ApiServer {
  owner: { id: string; username: string };
}

/** Summary of a pending invitation, included in admin user listings. */
export interface ApiPendingInvite {
  expiresAt: string;
}

/** A user account as seen from the admin view. */
export interface ApiAdminUser {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  pendingInvite: ApiPendingInvite | null;
}

/** One entry in a server's file list. */
export interface ApiFileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
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
  const headers = new Headers(options.headers);
  // Declare a JSON body only for string (JSON) bodies. A bodyless request
  // must not send "Content-Type: application/json"; a FormData upload must
  // let the browser set its own multipart content type.
  if (typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (data as { error?: string }).error ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface SetupCredentials {
  username: string;
  email: string;
  password: string;
}

interface CreateUserInput {
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

interface CreateServerInput {
  name: string;
  templateId: string;
  minecraftVersion?: string;
  memoryMb: number;
  cpuLimit: number;
}

/** The set of API calls used by the interface. */
export const api = {
  setupRequired: () =>
    request<{ setupRequired: boolean }>('/api/auth/setup-required'),

  me: () => request<{ user: ApiUser }>('/api/auth/me'),

  setup: (body: SetupCredentials) =>
    request<{ user: ApiUser }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: LoginCredentials) =>
    request<{ user: ApiUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  // --- Invitation flow (for accounts created by an administrator) ---

  getInvite: (token: string) =>
    request<{ username: string }>(`/api/auth/invite/${token}`),

  acceptInvite: (token: string, password: string) =>
    request<{ user: ApiUser }>(`/api/auth/invite/${token}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // --- Admin (mounted under /api/admin, ADMIN role required) ---

  listAdminUsers: () =>
    request<{ users: ApiAdminUser[] }>('/api/admin/users'),

  createAdminUser: (body: CreateUserInput) =>
    request<{ user: ApiAdminUser; inviteUrl: string }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  regenerateInvite: (userId: string) =>
    request<{ user: ApiAdminUser; inviteUrl: string }>(
      `/api/admin/users/${userId}/invite`,
      { method: 'POST' },
    ),

  deleteAdminUser: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    }),

  listAdminServers: () =>
    request<{ servers: ApiAdminServer[] }>('/api/admin/servers'),

  // --- Game servers (mounted under /api) ---

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

  // --- File manager ---

  listFiles: (serverId: string, dirPath: string) =>
    request<{ path: string; entries: ApiFileEntry[] }>(
      `/api/servers/${serverId}/files?path=${encodeURIComponent(dirPath)}`,
    ),

  readFile: (serverId: string, filePath: string) =>
    request<{ path: string; content: string }>(
      `/api/servers/${serverId}/file?path=${encodeURIComponent(filePath)}`,
    ),

  writeFile: (serverId: string, filePath: string, content: string) =>
    request<{ ok: boolean }>(`/api/servers/${serverId}/file`, {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, content }),
    }),

  deleteFile: (serverId: string, filePath: string) =>
    request<{ ok: boolean }>(
      `/api/servers/${serverId}/file?path=${encodeURIComponent(filePath)}`,
      { method: 'DELETE' },
    ),

  uploadFile: (serverId: string, dirPath: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ ok: boolean }>(
      `/api/servers/${serverId}/files?path=${encodeURIComponent(dirPath)}`,
      { method: 'POST', body: form },
    );
  },
};
