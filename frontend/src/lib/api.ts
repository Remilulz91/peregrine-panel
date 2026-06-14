// Small wrapper around fetch for talking to the Peregrine API.
// The authentication token lives in an httpOnly cookie, which the browser
// sends automatically thanks to `credentials: 'include'`.

/**
 * Supported Minecraft loader types (Java side). Bedrock is always 'vanilla'.
 * v0.41.0+: 'bukkit' and 'spigot' are BuildTools-compiled at runtime;
 * see the loader note in the create-server dialog.
 * v0.42.0+: 'purpur' (Paper fork), 'folia' (Paper's threaded fork),
 * 'quilt' (Fabric fork), 'mohist' (Forge + Bukkit hybrid).
 */
export type ServerLoader =
  | 'vanilla'
  | 'paper'
  | 'fabric'
  | 'forge'
  | 'neoforge'
  | 'bukkit'
  | 'spigot'
  | 'purpur'
  | 'folia'
  | 'quilt'
  | 'mohist'
  // v0.43.0+ — modern hybrids (mods + plugins).
  | 'arclight'
  | 'banner';

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

// v0.39.0 — admin Security dashboard payloads.

export interface ApiFailedLoginRow {
  id: number;
  kind: string;
  username: string | null;
  userId: string | null;
  remoteIp: string | null;
  details: string | null;
  createdAt: string;
}

export interface ApiFailedLoginAggregate {
  username: string;
  remoteIp: string;
  attempts: number;
  lastAt: string;
  firstAt: string;
  byKind: Record<string, number>;
}

export interface ApiFailedLoginStats {
  last24h: number;
  last7d: number;
  distinctUsernames7d: number;
  distinctIps7d: number;
}

export interface ApiSecurityFailedLogins {
  stats: ApiFailedLoginStats;
  topOffenders: ApiFailedLoginAggregate[];
  recent: ApiFailedLoginRow[];
  window: { days: number; limit: number };
}

export interface ApiBannedIp {
  jail: string;
  ip: string;
  bannedAt: number;
  bantime: number;
  expiresAt: number | null;
  /**
   * v0.42.0+: number of times this (jail, ip) has been banned ever.
   * A 1 means "first offence", anything higher means the IP keeps
   * coming back — typically a botnet or a persistent scanner.
   */
  bancount: number;
}

export type ApiFail2banStatus =
  | { available: true; bans: ApiBannedIp[]; jails: string[] }
  | { available: false; reason: 'not_configured' | 'unreadable' | 'bad_schema' };

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
  /** v0.22.1+: in-game warning lead time before a restart (minutes). */
  warningMinutes: number;
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

/**
 * Live host metrics surfaced on the Dashboard widget (v0.28.0+).
 * Refreshed by polling every few seconds while the Dashboard is open.
 */
export interface ApiHostMetrics {
  cpuPercent: number;
  cpuCount: number;
  /** 1 / 5 / 15-minute load average from the kernel. */
  loadAvg: [number, number, number];
  memUsedMb: number;
  memTotalMb: number;
  memPercent: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskPercent: number;
  capturedAt: number;
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
/** v0.29.0+: player access-control lists (whitelist / ops / bans). */
export interface ApiWhitelistEntry {
  uuid: string;
  name: string;
}

export interface ApiOpEntry {
  uuid: string;
  name: string;
  level: number;
  bypassesPlayerLimit?: boolean;
}

export interface ApiBannedPlayerEntry {
  uuid: string;
  name: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

export interface ApiBannedIpEntry {
  ip: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
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
    // v0.26.0+: single-session enforcement. When the backend rejects the
    // request with `auth.session_kicked`, the user signed in elsewhere
    // and the cookie we sent is now stale. We mark the page so the
    // Login screen can show a friendly message after the auth state
    // flips, then dispatch a custom event so the AuthProvider can
    // refresh and re-render the login.
    const code = (data as { code?: string } | undefined)?.code;
    if (response.status === 401 && code === 'auth.session_kicked') {
      try {
        sessionStorage.setItem('peregrine_kicked', '1');
      } catch {
        // sessionStorage can be blocked in private mode — best effort.
      }
      window.dispatchEvent(new Event('peregrine:auth-invalidated'));
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
  /** v0.22.0+: 'backup.create' (default) or 'server.restart'. */
  action?: 'backup.create' | 'server.restart';
  /** v0.22.1+: minutes between fire time and actual restart (0-30). */
  warningMinutes?: number;
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
  /**
   * v0.33.0+: update a user's username / email / role from the
   * admin panel. Omitted fields are left unchanged. Returns the
   * updated user.
   */
  updateAdminUser: (
    userId: string,
    body: { username?: string; email?: string; role?: 'USER' | 'ADMIN' },
  ) =>
    request<{ user: ApiAdminUser }>(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  listAdminServers: () =>
    request<{ servers: ApiAdminServer[] }>('/api/admin/servers'),

  // v0.39.0 — admin Security dashboard.
  adminSecurityFailedLogins: (limit = 100, days = 7) =>
    request<ApiSecurityFailedLogins>(
      `/api/admin/security/failed-logins?limit=${limit}&days=${days}`,
    ),
  adminSecurityBannedIps: () =>
    request<{ status: ApiFail2banStatus }>('/api/admin/security/banned-ips'),
  /**
   * v0.40.0+: deletes only the failed-auth rows (login_failed,
   * login_rate_limited, mfa_failed, sftp_failed,
   * sftp_rate_limited). Successful logins are preserved. The
   * action is audit-logged server-side.
   */
  adminClearFailedLogins: () =>
    request<{ deleted: number }>('/api/admin/security/clear-failed-logins', {
      method: 'POST',
    }),

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
  /**
   * v0.31.0+: changes the Minecraft version and/or loader of an
   * existing server. The container is destroyed and recreated; data
   * (world, mods, config) is preserved. Server is left stopped.
   */
  updateServerVersion: (
    id: string,
    minecraftVersion: string,
    loader: ServerLoader,
  ) =>
    request<{ server: ApiServer }>(`/api/servers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ minecraftVersion, loader }),
    }),
  hostResources: () =>
    request<{ resources: ApiHostResources }>('/api/host'),
  hostMetrics: () =>
    request<{ metrics: ApiHostMetrics }>('/api/host/metrics'),
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
  // v0.29.0+: player access-control lists.
  listWhitelist: (serverId: string) =>
    request<{ entries: ApiWhitelistEntry[] }>(`/api/servers/${serverId}/access/whitelist`),
  addWhitelist: (serverId: string, name: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/access/whitelist`,
      { method: 'POST', body: JSON.stringify({ name }) },
    ),
  removeWhitelist: (serverId: string, name: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/access/whitelist/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
  listOps: (serverId: string) =>
    request<{ entries: ApiOpEntry[] }>(`/api/servers/${serverId}/access/ops`),
  addOp: (serverId: string, name: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/access/ops`,
      { method: 'POST', body: JSON.stringify({ name }) },
    ),
  removeOp: (serverId: string, name: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/access/ops/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
  listBannedPlayers: (serverId: string) =>
    request<{ entries: ApiBannedPlayerEntry[] }>(
      `/api/servers/${serverId}/access/banned-players`,
    ),
  addBannedPlayer: (serverId: string, name: string, reason?: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/access/banned-players`,
      { method: 'POST', body: JSON.stringify({ name, reason }) },
    ),
  removeBannedPlayer: (serverId: string, name: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/access/banned-players/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    ),
  // v0.30.0+: kick / ban from the live online player list.
  kickPlayer: (serverId: string, name: string, reason?: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/players/${encodeURIComponent(name)}/kick`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
  banPlayer: (serverId: string, name: string, reason?: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/players/${encodeURIComponent(name)}/ban`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),
    listBannedIps: (serverId: string) =>
    request<{ entries: ApiBannedIpEntry[] }>(
      `/api/servers/${serverId}/access/banned-ips`,
    ),
  addBannedIp: (serverId: string, ip: string, reason?: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/access/banned-ips`,
      { method: 'POST', body: JSON.stringify({ ip, reason }) },
    ),
  removeBannedIp: (serverId: string, ip: string) =>
    request<{ ok: true; output: string }>(
      `/api/servers/${serverId}/access/banned-ips/${encodeURIComponent(ip)}`,
      { method: 'DELETE' },
    ),
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
  PLAYERS_MANAGE: 'players.manage',
  SETTINGS_VERSION: 'settings.version',
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
  // v0.42.0+: Purpur is a Paper fork with extra performance + config
  // knobs; placed next to Paper since they share the plugin ecosystem.
  'purpur',
  // Folia is Paper's threaded fork — for very large servers. Most
  // Paper plugins work, some break due to the threading model.
  'folia',
  'fabric',
  // Quilt is the Fabric fork. Mod ecosystem overlaps heavily.
  'quilt',
  'forge',
  'neoforge',
  // Mohist is the Forge + Bukkit hybrid (mods AND plugins).
  'mohist',
  // v0.41.0+: Bukkit/Spigot are compiled from source by BuildTools
  // inside the container on first start. Listed last so newcomers
  // don't pick them by reflex over Paper (which is a strict superset).
  'bukkit',
  'spigot',
];

/**
 * Loaders that are compiled from source by BuildTools on first
 * container start (no redistributable binary exists — DMCA-protected
 * sources). The UI shows a "first start takes 5–15 min, ~1–2 GiB RAM
 * during compile" warning when the user picks one of these.
 */
export const BUILDTOOLS_LOADERS: ReadonlySet<ServerLoader> = new Set<ServerLoader>([
  'bukkit',
  'spigot',
]);

/**
 * Curated Minecraft Java versions exposed in the create-server / change-
 * version dropdowns, **per loader**. "LATEST" always works (itzg picks
 * the newest stable release the loader supports). The rest are widely-
 * used breakpoints. Add or remove freely; this is purely UI shaping —
 * the backend validates the actual version string against Mojang's
 * manifest.
 *
 * v0.41.1+: the version dropdown is now scoped to the selected loader
 * so users can't pick combinations the loader doesn't support (e.g.
 * NeoForge for 1.8.9, which never existed). The compatibility floors
 * baked in below are:
 *
 *   - Vanilla   — every notable release back to 1.8.9
 *   - Paper     — 1.8.8 (the earliest the PaperMC project ships)
 *   - Fabric    — 1.14   (when Fabric API was introduced)
 *   - Forge     — 1.7.10 (Forge predates that but pre-1.7.10 servers
 *                 are vanishingly rare today)
 *   - NeoForge  — 1.20.1 (NeoForge was forked from Forge in late 2023)
 *   - Bukkit /  — 1.8.8 (BuildTools technically supports back to 1.4.5
 *     Spigot     but Mojang-mappings work cleanly from 1.8 on)
 */
// v0.42.0+: top of each curated list now carries the new Mojang
// year-based numbering (26.1, shipped 24 March 2026) for the loaders
// that track upstream quickly, plus the late-1.21 point releases
// (1.21.5, 1.21.6). Bukkit / Spigot / Forge stay capped at 1.21.x
// while their toolchains catch up. Sources cited in CHANGELOG.

const VANILLA_MC_VERSIONS: string[] = [
  'LATEST',
  '26.1',
  '1.21.6',
  '1.21.5',
  '1.21.4',
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

const PAPER_MC_VERSIONS: string[] = [
  'LATEST',
  '26.1',
  '1.21.6',
  '1.21.5',
  '1.21.4',
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
  '1.8.8',
];

const FABRIC_MC_VERSIONS: string[] = [
  'LATEST',
  '26.1',
  '1.21.6',
  '1.21.5',
  '1.21.4',
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
  '1.14.4',
];

// Forge does not (yet) ship for 1.21.5+ as of mid-2026 — keep the
// list capped at 1.21.1, which remains the most-installed line.
const FORGE_MC_VERSIONS: string[] = [
  'LATEST',
  '1.21.1',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
  '1.17.1',
  '1.16.5',
  '1.12.2',
  '1.7.10',
];

const NEOFORGE_MC_VERSIONS: string[] = [
  'LATEST',
  '26.1',
  '1.21.6',
  '1.21.5',
  '1.21.4',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
];

// Bukkit / Spigot stay capped where BuildTools is known to work
// cleanly — the 26.1 toolchain may still need a few weeks to settle.
const BUKKIT_SPIGOT_MC_VERSIONS: string[] = [
  'LATEST',
  '1.21.6',
  '1.21.5',
  '1.21.4',
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
  '1.8.8',
];

// v0.42.0+ — Paper-family forks and the Forge/Bukkit hybrid.

// Purpur tracks Paper; shipped for 1.21.x and 26.1.
const PURPUR_MC_VERSIONS: string[] = [
  'LATEST',
  '26.1',
  '1.21.6',
  '1.21.5',
  '1.21.4',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
];

// Folia was first released for 1.19.4 and has stayed on the modern
// Paper line; no LTS-style back-port.
const FOLIA_MC_VERSIONS: string[] = [
  'LATEST',
  '26.1',
  '1.21.6',
  '1.21.5',
  '1.21.4',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
];

// Quilt tracks Fabric closely; back-compat to 1.18.2.
const QUILT_MC_VERSIONS: string[] = [
  'LATEST',
  '26.1',
  '1.21.6',
  '1.21.5',
  '1.21.4',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.18.2',
];

// Mohist is the Forge + Bukkit hybrid — release cadence lags upstream
// Forge, so the curated list reflects what's typically downloadable
// today rather than what Forge itself supports.
const MOHIST_MC_VERSIONS: string[] = [
  'LATEST',
  '1.21.1',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
  '1.16.5',
  '1.12.2',
  '1.7.10',
];

// v0.43.0+ — Arclight (the modern Forge/NeoForge + Bukkit hybrid)
// tracks both upstream loaders. Has 1.21.x builds for Forge and
// NeoForge.
const ARCLIGHT_MC_VERSIONS: string[] = [
  'LATEST',
  '1.21.4',
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
];

// Banner (Fabric + Bukkit hybrid) — modern Fabric versions only.
const BANNER_MC_VERSIONS: string[] = [
  'LATEST',
  '1.21.4',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.1',
  '1.19.4',
];

/**
 * Single lookup table the create-server dialog + per-server settings
 * tab use to populate the version dropdown when the user picks a
 * loader. Exported for direct read; mutate the per-loader arrays
 * above (not this Record) if you need to add a version.
 */
export const VERSIONS_BY_LOADER: Record<ServerLoader, string[]> = {
  vanilla: VANILLA_MC_VERSIONS,
  paper: PAPER_MC_VERSIONS,
  fabric: FABRIC_MC_VERSIONS,
  forge: FORGE_MC_VERSIONS,
  neoforge: NEOFORGE_MC_VERSIONS,
  bukkit: BUKKIT_SPIGOT_MC_VERSIONS,
  spigot: BUKKIT_SPIGOT_MC_VERSIONS,
  // v0.42.0+
  purpur: PURPUR_MC_VERSIONS,
  folia: FOLIA_MC_VERSIONS,
  quilt: QUILT_MC_VERSIONS,
  mohist: MOHIST_MC_VERSIONS,
  // v0.43.0+
  arclight: ARCLIGHT_MC_VERSIONS,
  banner: BANNER_MC_VERSIONS,
};

/**
 * Convenience helper. Same as `VERSIONS_BY_LOADER[loader]` but does
 * a safe fallback to Vanilla if a future loader is somehow added on
 * the backend before being declared here.
 */
export function mcVersionsFor(loader: ServerLoader): string[] {
  return VERSIONS_BY_LOADER[loader] ?? VANILLA_MC_VERSIONS;
}

/**
 * Legacy alias retained for any external code reading the broad
 * Vanilla list. New code should call `mcVersionsFor(loader)`.
 */
export const JAVA_MC_VERSIONS: string[] = VANILLA_MC_VERSIONS;

/**
 * Bedrock numbering is awkward (e.g. 1.21.50.10), so we just expose
 * LATEST. itzg keeps the image up to date with Mojang's releases.
 */
export const BEDROCK_MC_VERSIONS: string[] = ['LATEST'];
