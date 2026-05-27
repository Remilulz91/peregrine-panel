import { randomUUID } from 'node:crypto';
import { db } from './db';

/**
 * A single entry in a server's activity log. `kind` is a stable machine
 * identifier (e.g. "server.start", "files.delete"); the frontend turns
 * it into a localized sentence via the i18n table. `details` is free-form
 * context (a filename, a new name, ...) that the UI substitutes into the
 * translated string.
 */
export interface ActivityEntry {
  id: string;
  serverId: string;
  actorId: string | null;
  /** Username at the time the event was logged. May be null for system events. */
  actorUsername: string | null;
  kind: string;
  details: string | null;
  createdAt: string;
}

// The raw row shape stored in SQLite (snake_case + joined username).
interface ActivityRow {
  id: string;
  server_id: string;
  actor_id: string | null;
  actor_username: string | null;
  kind: string;
  details: string | null;
  created_at: string;
}

function toEntry(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    serverId: row.server_id,
    actorId: row.actor_id,
    actorUsername: row.actor_username,
    kind: row.kind,
    details: row.details,
    createdAt: row.created_at,
  };
}

/**
 * Records one activity event. Best-effort: any failure (e.g. database
 * locked) is swallowed so the calling action never breaks because of a
 * logging issue.
 */
export function logActivity(input: {
  serverId: string;
  actorId: string | null;
  kind: string;
  details?: string | null;
}): void {
  try {
    db.prepare(
      `INSERT INTO server_activity (id, server_id, actor_id, kind, details)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      input.serverId,
      input.actorId,
      input.kind,
      input.details ?? null,
    );
  } catch {
    // Activity logging must never break the operation that triggered it.
  }
}

/**
 * Returns the latest activity entries for a server, newest first. The
 * caller pass-throughs `limit` so the UI can keep the table manageable.
 */
export function listActivityForServer(
  serverId: string,
  limit = 100,
): ActivityEntry[] {
  const rows = db
    .prepare(
      `SELECT
         a.id           AS id,
         a.server_id    AS server_id,
         a.actor_id     AS actor_id,
         u.username     AS actor_username,
         a.kind         AS kind,
         a.details      AS details,
         a.created_at   AS created_at
       FROM server_activity a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.server_id = ?
       ORDER BY a.created_at DESC
       LIMIT ?`,
    )
    .all(serverId, limit) as unknown as ActivityRow[];
  return rows.map(toEntry);
}
