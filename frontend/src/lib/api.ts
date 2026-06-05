// Small wrapper around fetch for talking to the Peregrine API.
// The authentication token lives in an httpOnly cookie, which the browser
// sends automatically thanks to `credentials: 'include'`.

/** Supported Minecraft loader types (Java side). Bedrock is always 'vanilla'. */
export type ServerLoader = 'vanilla' | 'paper' | 'fabric' | 'forge';

/** A user account, as returned by the API. */
export interface ApiUser {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  mfaEnabled?: boolean;
  mfaRecoveryRemaining?: number;
}

export interface ApiTemplate {
  id: string;
  name: string;
  dockerImage: string;
  defaultVersion: string;
  kind: string;
}

export interface ApiServer {
  id: string;
  name: string;
  status: string;
  templateId: string;
  minecraftVersion: string;
  /** Server flavour: vanilla / paper / fabric / forge. */
  loader: ServerLoader;
  /** Free-text description shown under the name. Empty string = none. */
  description: string;
  /** True when a custom PNG icon has been uploaded for this server. */
  hasIcon: boolean;
  /** mtime (ms) of the icon file, used for cache-busting; null if none. */
  iconUpdatedAt: number | null;
  /** Disk quota in MiB, or null for no enforcement. */
  diskQuotaMb: number | null;
  /** Measured disk usage in MiB, refreshed by the backend worker. */
  diskUsedMb: number;
  memoryMb: number;
  cpuLimit: number;
  port: number;
  createdAt: string;
  isOwner: boolean;
  ownerUsername: string;
}

export interface ApiAdminServer extends ApiServer {
  owner: { id: string; username: string };
}

export interface ApiActivityEntry {
  id: string;
  serverId: string;
  actorId: string | null;
  actorUsername: string | null;
  kind: string;
  details: string | null;
  createdAt: string;
}

export interface ApiPendingInvite {
  expiresAt: string;
}

export interface ApiAdminUser {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  needsActivation: boolean;
  mfaEnabled: boolean;
  pendingInvite: ApiPendingInvite | null;
}

export interface ApiFileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
}

export interface ApiBackup {
  id: string;
  serverId: string;
  name: string;
  sizeBytes: number;
  createdAt: string;
  createdByUsername: string | null;
}

export interface ApiDiskUsage {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  reservedBytes: number;
}

export interface ApiSubuser {
  id: string;
  serverId: string;
  userId: string;
  username: string;
  email: string;
  permissions: string[];
  createdAt: string;
}

export interface ApiSchedule {
  id: string;
  serverId: string;
  name: string;
  action: string;
  frequency: 'hourly' | 'daily' | 'weekly';
  hour: number;
  minute: number;
  dayOfWeek: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

export interface ApiMfaChallenge {
  requiresMfa: true;
}

export interface ApiMfaSetup {
  secret: string;
  otpAuthUri: string;
}

export type ServerAction = 'start' | 'stop' | 'restart';


export interface ApiHostResources {
  totalMemMb: number;
  totalCpus: number;
  reservedMemMb: number;
  reservedCpus: number;
  allocatedMemMb: number;
  allocatedCpus: number;
  allocatableMemMb: number;
  allocatableCpus: number;
}

export interface ApiUpdateInfo {
  currentVersion: string;
  /** null when the GitHub check has not succeeded yet (no badge). */
  latestVersion: string | null;
  upToDate: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
}

export interface ApiPlayerList {
  /** False for Bedrock or any template without RCON support. */
  supported: boolean;
  running: boolean;
  online: number;
  max: number;
  players: string[];
}
export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(status: number, message: string, payload: unknown = null) {
    super(message);
    this.status = status;
    this.payload = payload;
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
    // Backends in this project send { error: '...' }. Fastify's built-in
    // validation handler sends { error: 'Bad Request', message: '<detail>' }
    // — in that case we want the detail, not the generic "Bad Request".
    // Strategy: prefer `message` if it exists and `error` is one of the
    // generic Fastify labels; otherwise fall back to `error`.
    const d = data as { error?: string; message?: string };
    const GENERIC = new Set([
      'Bad Request', 'Unauthorized', 'Forbidden', 'Not Found',
      'Conflict', 'Insufficient Storage', 'Internal Server Error',
    ]);
    let message: string;
    if (d.message && (!d.error || GENERIC.has(d.error))) {
      message = d.message;
    } else if (d.error) {
      message = d.error;
    } else {
      message = `Request failed (${response.status})`;
    }
    throw new ApiError(response.status, message, data);
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
  /** Optional free-text description shown under the server name. */
  description?: string;
  minecraftVersion?: string;
  /** Optional loader override. Bedrock servers ignore this; Java defaults to vanilla. */
  loader?: ServerLoader;
  /**
   * Optional owner account. Defaults to the calling admin. Only
   * meaningful when the caller is an administrator — the backend
   * rejects the create with 403 otherwise.
   */
  ownerId?: string;
  /**
   * When true (default), the server is auto-started right after the
   * install completes. Set to false to leave it offline.
   */
  autostart?: boolean;
  /** Optional disk quota in MiB. 0 / undefined = unlimited. */
  diskQuotaMb?: number;
  memoryMb: number;
  cpuLimit: number;
}

export interface ScheduleInput {
  name: string;
  frequency: 'hourly' | 'daily' | 'weekly';
  hour: number;
  minute: number;
  dayOfWeek: number;
  enabled: boolean;
}

export type LoginResponse =
  | { user: ApiUser; requiresMfa?: undefined }
  | ApiMfaChallenge;

/** Warning about an invalid `server.properties` value (v0.20.1+). */
export interface ApiGameSettingsWarning {
  key: string;
  rawValue: string;
  fallback: string;
  reason:
    | 'not_in_enum'
    | 'not_a_boolean'
    | 'not_an_integer'
    | 'out_of_range';
}

/** Subset of `server.properties` we expose in the Game settings tab (v0.18.0+). */
export interface ApiGameSettings {
  motd: string;
  maxPlayers: number;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  pvp: boolean;
  onlineMode: boolean;
  whiteList: boolean;
  viewDistance: number;
}

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
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  mfaSetup: () =>
    request<ApiMfaSetup>('/api/auth/mfa/setup', { method: 'POST' }),
  mfaEnable: (secret: string, code: string) =>
    request<{ recoveryCodes: string[] }>('/api/auth/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ secret, code }),
    }),
  mfaDisable: (password: string) =>
    request<{ ok: boolean }>('/api/auth/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  mfaVerify: (input: { code?: string; recoveryCode?: string }) =>
    request<{ user: ApiUser }>('/api/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getInvite: (token: string) =>
    request<{ username: string }>(`/api/auth/invite/${token}`),
  acceptInvite: (token: string, password: string) =>
    request<{ user: ApiUser }>(`/api/auth/invite/${token}`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

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
  resetUserMfa: (userId: string) =>
    request<{ user: ApiAdminUser }>(
      `/api/admin/users/${userId}/mfa-reset`,
      { method: 'POST' },
    ),
  deleteAdminUser: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/users/${userId}`, {
      method: 'DELETE',
    }),
  listAdminServers: () =>
    request<{ servers: ApiAdminServer[] }>('/api/admin/servers'),

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
  updateServerDescription: (id: string, description: string) =>
    request<{ server: ApiServer }>(`/api/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ description }),
    }),
  updateServerResources: (id: string, memoryMb: number, cpuLimit: number) =>
    request<{ server: ApiServer }>(`/api/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ memoryMb, cpuLimit }),
    }),
  updateServerDiskQuota: (id: string, diskQuotaMb: number) =>
    request<{ server: ApiServer }>(`/api/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ diskQuotaMb }),
    }),
  hostResources: () =>
    request<{ resources: ApiHostResources }>('/api/host'),
  updateInfo: () => request<ApiUpdateInfo>('/api/updates'),
  serverPlayers: (id: string) =>
    request<ApiPlayerList>(`/api/servers/${id}/players`),

  /**
   * Returns the public URL of a server's icon, with a cache-busting
   * query string when an icon has been set. Returns null when no
   * icon has been uploaded yet — callers should render a placeholder
   * in that case rather than a broken image.
   */
  serverIconUrl: (server: { id: string; hasIcon: boolean; iconUpdatedAt: number | null }) =>
    server.hasIcon
      ? `/api/servers/${server.id}/icon?v=${server.iconUpdatedAt ?? 0}`
      : null,
  uploadServerIcon: (id: string, file: File) => {
    const form = new FormData();
    form.append('icon', file);
    return request<{ ok: boolean; iconUpdatedAt: number }>(
      `/api/servers/${id}/icon`,
      { method: 'POST', body: form },
    );
  },
  deleteServerIcon: (id: string) =>
    request<{ ok: boolean }>(`/api/servers/${id}/icon`, { method: 'DELETE' }),
  getGameSettings: (id: string) =>
    request<{ settings: ApiGameSettings; warnings: ApiGameSettingsWarning[] }>(
      `/api/servers/${id}/game-settings`,
    ),
  updateGameSettings: (id: string, settings: ApiGameSettings) =>
    request<{ settings: ApiGameSettings }>(`/api/servers/${id}/game-settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
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

  listSchedules: (serverId: string) =>
    request<{ schedules: ApiSchedule[] }>(
      `/api/servers/${serverId}/schedules`,
    ),
  createSchedule: (serverId: string, body: ScheduleInput) =>
    request<{ schedule: ApiSchedule }>(
      `/api/servers/${serverId}/schedules`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  updateSchedule: (
    serverId: string,
    scheduleId: string,
    body: ScheduleInput,
  ) =>
    request<{ schedule: ApiSchedule }>(
      `/api/servers/${serverId}/schedules/${scheduleId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  deleteSchedule: (serverId: string, scheduleId: string) =>
    request<{ ok: boolean }>(
      `/api/servers/${serverId}/schedules/${scheduleId}`,
      { method: 'DELETE' },
    ),
  runScheduleNow: (serverId: string, scheduleId: string) =>
    request<{ ok: boolean }>(
      `/api/servers/${serverId}/schedules/${scheduleId}/run`,
      { method: 'POST' },
    ),

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

  sftpConfig: () =>
    request<{
      enabled: boolean;
      port: number;
      username: string;
      mfaEnabled: boolean;
    }>('/api/sftp'),
};

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

export function hasPermission(
  myPermissions: string[],
  permission: string,
): boolean {
  return myPermissions.includes(permission);
}

// --- Server creation constants -------------------------------------------

/** Loader options offered to the user when creating a Java server. */
export const JAVA_LOADERS: ServerLoader[] = [
  'vanilla',
  'paper',
  'fabric',
  'forge',
];

/**
 * Curated Minecraft Java versions exposed in the create-server dropdown.
 * "LATEST" always works (itzg picks the newest stable release). The rest
 * are widely-used breakpoints — Forge / Fabric may not exist for every
 * one of them, in which case the container fails to install (status
 * INSTALL_FAILED). Add or remove freely; this is purely UI shaping.
 */
export const JAVA_MC_VERSIONS: string[] = [
  'LATEST',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
  '1.17.1',
  '1.16.5',
  '1.12.2',
  '1.8.9',
];

/**
 * Bedrock numbering is awkward (e.g. 1.21.50.10), so we just expose
 * LATEST. itzg keeps the image up to date with Mojang's releases.
 */
export const BEDROCK_MC_VERSIONS: string[] = ['LATEST'];
