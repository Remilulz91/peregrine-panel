import { randomUUID } from 'node:crypto';
import { db } from './db';
import {
  ALL_PERMISSIONS,
  type Permission,
  sanitisePermissions,
} from './permissions';

/** A subuser row, as used by the backend. */
export interface SubuserRecord {
  id: string;
  serverId: string;
  userId: string;
  /** Username at the time of the request — joined from `users`. */
  username: string;
  email: string;
  permissions: Permission[];
  createdAt: string;
}

interface SubuserRow {
  id: string;
  server_id: string;
  user_id: string;
  username: string;
  email: string;
  permissions: string;
  created_at: string;
}

function toRecord(row: SubuserRow): SubuserRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.permissions);
  } catch {
    parsed = [];
  }
  return {
    id: row.id,
    serverId: row.server_id,
    userId: row.user_id,
    username: row.username,
    email: row.email,
    permissions: sanitisePermissions(parsed),
    createdAt: row.created_at,
  };
}

const LIST_SQL = `
  SELECT
    s.id          AS id,
    s.server_id   AS server_id,
    s.user_id     AS user_id,
    u.username    AS username,
    u.email       AS email,
    s.permissions AS permissions,
    s.created_at  AS created_at
  FROM server_subusers s
  JOIN users u ON u.id = s.user_id
`;

/** Lists every subuser for a server, newest first. */
export function listSubusersForServer(serverId: string): SubuserRecord[] {
  const rows = db
    .prepare(`${LIST_SQL} WHERE s.server_id = ? ORDER BY s.created_at DESC`)
    .all(serverId) as unknown as SubuserRow[];
  return rows.map(toRecord);
}

/** Looks up a subuser row for one (server, user) pair. */
export function getSubuser(
  serverId: string,
  userId: string,
): SubuserRecord | null {
  const row = db
    .prepare(`${LIST_SQL} WHERE s.server_id = ? AND s.user_id = ?`)
    .get(serverId, userId) as SubuserRow | undefined;
  return row ? toRecord(row) : null;
}

/** Looks up a subuser by its own row id, scoped to a server. */
export function getSubuserById(
  id: string,
  serverId: string,
): SubuserRecord | null {
  const row = db
    .prepare(`${LIST_SQL} WHERE s.id = ? AND s.server_id = ?`)
    .get(id, serverId) as SubuserRow | undefined;
  return row ? toRecord(row) : null;
}

/** Creates a new subuser row and returns it. */
export function addSubuser(input: {
  serverId: string;
  userId: string;
  permissions: Permission[];
}): SubuserRecord {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO server_subusers (id, server_id, user_id, permissions)
     VALUES (?, ?, ?, ?)`,
  ).run(
    id,
    input.serverId,
    input.userId,
    JSON.stringify(input.permissions),
  );
  const created = getSubuserById(id, input.serverId);
  if (!created) {
    throw new Error('Failed to create the subuser row.');
  }
  return created;
}

/** Replaces the permission set on an existing subuser row. */
export function updateSubuserPermissions(
  id: string,
  permissions: Permission[],
): void {
  db.prepare(
    'UPDATE server_subusers SET permissions = ? WHERE id = ?',
  ).run(JSON.stringify(permissions), id);
}

/** Removes a subuser row. */
export function removeSubuser(id: string): void {
  db.prepare('DELETE FROM server_subusers WHERE id = ?').run(id);
}

/** Returns every server id this user is a subuser on. */
export function serverIdsSharedWithUser(userId: string): string[] {
  const rows = db
    .prepare('SELECT server_id FROM server_subusers WHERE user_id = ?')
    .all(userId) as unknown as { server_id: string }[];
  return rows.map((r) => r.server_id);
}

/**
 * Returns the permissions a user has on a given server. An empty array
 * means "no subuser row" — callers must combine this with the owner /
 * admin checks to decide whether to allow an action.
 *
 * Owners and admins always implicitly have the full permission set;
 * this helper does NOT account for that — see `userHasPermission`.
 */
export function permissionsFor(
  serverId: string,
  userId: string,
): Permission[] {
  const subuser = getSubuser(serverId, userId);
  return subuser ? subuser.permissions : [];
}

/**
 * Resolves the *effective* permissions for a user on a server:
 *   - owners and admins get every permission,
 *   - subusers get exactly what was granted,
 *   - everyone else gets nothing.
 */
export function effectivePermissions(input: {
  serverId: string;
  userId: string;
  role: string;
  ownerId: string;
}): Permission[] {
  if (input.role === 'ADMIN' || input.userId === input.ownerId) {
    return [...ALL_PERMISSIONS];
  }
  return permissionsFor(input.serverId, input.userId);
}
