import { randomBytes, randomUUID } from 'node:crypto';
import { db } from './db';

/** A pending invitation, as used inside the backend. */
export interface InviteRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

interface InviteRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

function toRecord(row: InviteRow): InviteRecord {
  return {
    id: row.id,
    userId: row.user_id,
    token: row.token,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

/** How long an invite stays valid, in milliseconds (7 days). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Creates a new invitation for the given user, or replaces an existing one.
 * Returns the freshly created record with its single-use token.
 */
export function createInviteFor(userId: string): InviteRecord {
  // Each user has at most one pending invitation, so a regeneration simply
  // overwrites any previous token.
  db.prepare('DELETE FROM user_invites WHERE user_id = ?').run(userId);

  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO user_invites (id, user_id, token, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, userId, token, expiresAt);

  return {
    id,
    userId,
    token,
    expiresAt,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Looks up an invitation by its token. Returns null when the token is
 * unknown OR when it has expired (expired invites are deleted on the fly).
 */
export function findInviteByToken(token: string): InviteRecord | null {
  const row = db
    .prepare('SELECT * FROM user_invites WHERE token = ?')
    .get(token) as InviteRow | undefined;
  if (!row) {
    return null;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM user_invites WHERE id = ?').run(row.id);
    return null;
  }
  return toRecord(row);
}

/** Looks up the pending invitation for a given user, if any. */
export function findInviteByUserId(userId: string): InviteRecord | null {
  const row = db
    .prepare('SELECT * FROM user_invites WHERE user_id = ?')
    .get(userId) as InviteRow | undefined;
  return row ? toRecord(row) : null;
}

/** Deletes an invitation by its token (no-op when already gone). */
export function deleteInviteByToken(token: string): void {
  db.prepare('DELETE FROM user_invites WHERE token = ?').run(token);
}
