/**
 * The granular permission set used by Peregrine's subuser system.
 *
 * Each constant is the string stored in the database (in the JSON-encoded
 * `permissions` column of `server_subusers`). Adding a new permission
 * means adding it here and gating the corresponding route — keep the
 * names dot-separated and grouped by category for clarity.
 *
 * Note: ownership and full deletion of a server are NOT permissions you
 * can grant; they always belong to the owner (and to administrators by
 * virtue of their role). This prevents privilege escalation through the
 * subuser interface.
 */

export const PERMISSION = {
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
  /** v0.29.0+: manage whitelist / ops / bans via the Game tab. */
  PLAYERS_MANAGE: 'players.manage',
  /** v0.31.0+: change the Minecraft version / loader on an existing server. */
  SETTINGS_VERSION: 'settings.version',
} as const;

/** Type-level union of every valid permission string. */
export type Permission = (typeof PERMISSION)[keyof typeof PERMISSION];

/** Every permission, in the order the UI displays them. */
export const ALL_PERMISSIONS: readonly Permission[] = [
  PERMISSION.CONTROL_START,
  PERMISSION.CONTROL_STOP,
  PERMISSION.CONTROL_RESTART,
  PERMISSION.CONSOLE_SEND,
  PERMISSION.FILES_WRITE,
  PERMISSION.FILES_DELETE,
  PERMISSION.BACKUPS_CREATE,
  PERMISSION.BACKUPS_RESTORE,
  PERMISSION.BACKUPS_DELETE,
  PERMISSION.BACKUPS_DOWNLOAD,
  PERMISSION.SETTINGS_RENAME,
  PERMISSION.PLAYERS_MANAGE,
  PERMISSION.SETTINGS_VERSION,
];

const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);

/** True if the given string is one of Peregrine's known permissions. */
export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/** Filters an arbitrary array down to the recognised permissions. */
export function sanitisePermissions(values: unknown): Permission[] {
  if (!Array.isArray(values)) return [];
  const out: Permission[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (typeof v === 'string' && isPermission(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}
