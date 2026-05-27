import { randomUUID } from 'node:crypto';
import { db } from './db';

/** A backup row, as stored by the panel. */
export interface BackupRecord {
  id: string;
  serverId: string;
  name: string;
  filePath: string;
  sizeBytes: number;
  createdBy: string | null;
  /** Username at the time the backup was created. */
  createdByUsername: string | null;
  createdAt: string;
}

// Raw row shape returned by SQLite (snake_case + joined username).
interface BackupRow {
  id: string;
  server_id: string;
  name: string;
  file_path: string;
  size_bytes: number;
  created_by: string | null;
  created_by_username: string | null;
  created_at: string;
}

function toRecord(row: BackupRow): BackupRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    filePath: row.file_path,
    sizeBytes: row.size_bytes,
    createdBy: row.created_by,
    createdByUsername: row.created_by_username,
    createdAt: row.created_at,
  };
}

/** How many backups one server may keep at a time. Older ones are pruned. */
export const MAX_BACKUPS_PER_SERVER = 5;

const LIST_SQL = `
  SELECT
    b.id              AS id,
    b.server_id       AS server_id,
    b.name            AS name,
    b.file_path       AS file_path,
    b.size_bytes      AS size_bytes,
    b.created_by      AS created_by,
    u.username        AS created_by_username,
    b.created_at      AS created_at
  FROM server_backups b
  LEFT JOIN users u ON u.id = b.created_by
`;

/** Lists every backup for a server, newest first. */
export function listBackupsForServer(serverId: string): BackupRecord[] {
  const rows = db
    .prepare(`${LIST_SQL} WHERE b.server_id = ? ORDER BY b.created_at DESC`)
    .all(serverId) as unknown as BackupRow[];
  return rows.map(toRecord);
}

/** Counts how many backups exist for a server (used to enforce the cap). */
export function countBackupsForServer(serverId: string): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS count FROM server_backups WHERE server_id = ?',
    )
    .get(serverId) as { count: number };
  return row.count;
}

/** Returns the oldest backup for a server, or null. Used to prune. */
export function oldestBackupForServer(
  serverId: string,
): BackupRecord | null {
  const row = db
    .prepare(
      `${LIST_SQL} WHERE b.server_id = ? ORDER BY b.created_at ASC LIMIT 1`,
    )
    .get(serverId) as BackupRow | undefined;
  return row ? toRecord(row) : null;
}

/** Looks up a backup by id, or returns null. */
export function getBackup(id: string): BackupRecord | null {
  const row = db
    .prepare(`${LIST_SQL} WHERE b.id = ?`)
    .get(id) as BackupRow | undefined;
  return row ? toRecord(row) : null;
}

/** Creates a new backup row (the .tar.gz must already exist on disk). */
export function createBackupRow(input: {
  serverId: string;
  name: string;
  filePath: string;
  sizeBytes: number;
  createdBy: string | null;
}): BackupRecord {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO server_backups
       (id, server_id, name, file_path, size_bytes, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.serverId,
    input.name,
    input.filePath,
    input.sizeBytes,
    input.createdBy,
  );
  const created = getBackup(id);
  if (!created) {
    throw new Error('Failed to create the backup row.');
  }
  return created;
}

/** Removes a backup row (does NOT delete the file on disk). */
export function deleteBackupRow(id: string): void {
  db.prepare('DELETE FROM server_backups WHERE id = ?').run(id);
}
