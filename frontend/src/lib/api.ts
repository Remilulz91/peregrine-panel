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
  /** True when the viewer is the server's owner. */
  isOwner: boolean;
  /** Username of the owner — useful when the viewer is a subuser. */
  ownerUsername: string;
}

/** A game server as seen from the admin view (includes the owner). */
export interface ApiAdminServer extends ApiServer {
  owner: { id: string; username: string };
}

/** One entry in a server's activity log. */
export interface ApiActivityEntry {
  id: string;
  serverId: string;
  actorId: string | null;
  actorUsername: string | null;
  kind: string;
  details: string | null;
  createdAt: string;
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
  needsActivation: boolean;
  pendingInvite: ApiPendingInvite | null;
}

/** One entry in a server's file list. */
export interface ApiFileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
}

/** One backup for a server, as returned by the API. */
export interface ApiBackup {
  id: string;
  serverId: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  createdByUsername: string | null;
}

/** Current usage of the backups disk, in bytes. */
export interface ApiDiskUsage {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  reservedBytes: number;
}

/** One subuser on a server, as returned by the API. */
export interface ApiSubuser {
  id: string;
  serverId: string;
  userId: string;
  username: string;
  email: string;
  permissions: string[];
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
  const headers = new Headers(options.headers);
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

  // --- Invitation flow (admin-created accounts) ---
  getInvite: (token: string) =>
    request<{ username: string }>(`/api/auth/invite/${token}`),
  acceptInvite: (token: string, password: string) =>
    request<{ user: ApiUser }>(`/api/auth/invite/${token}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  // --- Admin ---
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

  // --- Game servers ---
  listTemplates: () =>
    request<{ templates: ApiTemplate[] }>('/api/templates'),
  listServers: () => request<{ servers: ApiServer[] }>('/api/servers'),
  getServer: (id: string) =>
    request<{ server: ApiServer; myPermissions: string[] }>(
      `/api/servers/${id}`,
    ),
  createServer: (body: CreateServerInput) =>
    request<{ server: ApiServer }>('/api/servers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  renameServer: (id: string, name: string) =>
    request<{ server: ApiServer }>(`/api/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  deleteServer: (id: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}`, { method: 'DELETE' }),
  serverAction: (id: string, action: ServerAction) =>
    request<{ ok: boolean }>(`/api/servers/${id}/${action}`, {
      method: 'POST',
    }),
  listActivity: (id: string) =>
    request<{ entries: ApiActivityEntry[] }>(
      `/api/servers/${id}/activity`,
    ),

  // --- Subusers (owner-only) ---
  listSubusers: (serverId: string) =>
    request<{ subusers: ApiSubuser[]; availablePermissions: string[] }>(
      `/api/servers/${serverId}/subusers`,
    ),
  addSubuser: (serverId: string, email: string, permissions: string[]) =>
    request<{ subuser: ApiSubuser }>(`/api/servers/${serverId}/subusers`, {
      method: 'POST',
      body: JSON.stringify({ email, permissions }),
    }),
  updateSubuser: (
    serverId: string,
    subId: string,
    permissions: string[],
  ) =>
    request<{ subuser: ApiSubuser }>(
      `/api/servers/${serverId}/subusers/${subId}`,
      { method: 'PATCH', body: JSON.stringify({ permissions }) },
    ),
  removeSubuser: (serverId: string, subId: string) =>
    request<{ ok: boolean }>(
      `/api/servers/${serverId}/subusers/${subId}`,
      { method: 'DELETE' },
    ),

  // --- Backups & disk ---
  diskUsage: () => request<{ usage: ApiDiskUsage }>('/api/disk'),
  listBackups: (serverId: string) =>
    request<{ backups: ApiBackup[]; max: number }>(
      `/api/servers/${serverId}/backups`,
    ),
  createBackup: (serverId: string, name: string) =>
    request<{ backup: ApiBackup }>(`/api/servers/${serverId}/backups`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteBackup: (serverId: string, backupId: string) =>
    request<{ ok: boolean }>(
      `/api/servers/${serverId}/backups/${backupId}`,
      { method: 'DELETE' },
    ),
  restoreBackup: (serverId: string, backupId: string) =>
    request<{ ok: boolean }>(
      `/api/servers/${serverId}/backups/${backupId}/restore`,
      { method: 'POST' },
    ),
  backupDownloadUrl: (serverId: string, backupId: string) =>
    `/api/servers/${serverId}/backups/${backupId}/download`,

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

// --- Shared permission constants (must mirror backend lib/permissions.ts) ---

export const PERM = {
  CONTROL_START: 'control.start',
  CONTROL_STOP: 'control.stop',
  CONTROL_RESTART: 'control.restart',
  CONSOLE_SEND: 'console.send',
  FILES_WRITE: 'files.write',
  FILES_DELETE: 'files.delete',
  BACKUPS_CREATE: 'backups.create',
  BACKUPS_RESTORE: 'backups.restore',
  BACKUPS_DELETE: 'backups.delete',
  BACKUPS_DOWNLOAD: 'backups.download',
  SETTINGS_RENAME: 'settings.rename',
} as const;

/** Convenience: does the viewer have a given permission on this server? */
export function hasPermission(
  myPermissions: string[],
  permission: string,
): boolean {
  return myPermissions.includes(permission);
}
