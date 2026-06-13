import { randomUUID } from 'node:crypto';
import { db } from './db';

/** A user account, as used inside the backend. */
export interface UserRecord {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: string;
  createdAt: string;
  /** Base32 TOTP secret, or null when MFA is off. */
  mfaSecret: string | null;
  /**
   * JSON-encoded array of Argon2-hashed recovery codes, or null when
   * MFA is off. The raw string is intentionally exposed so lib/mfa.ts
   * can manage the list (parse / verify / shrink).
   */
  mfaRecoveryCodes: string | null;
  /**
   * v0.26.0+: random hex token that uniquely identifies the user's
   * currently-active session. Rotated on every successful login so a
   * cookie issued in a previous session becomes invalid the moment a
   * new one is created — even from the same browser. The JWT cookie
   * embeds this value in its `sid` claim.
   */
  sessionId: string;
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
  mfa_secret: string | null;
  mfa_recovery_codes: string | null;
  session_id: string;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
    mfaSecret: row.mfa_secret,
    mfaRecoveryCodes: row.mfa_recovery_codes,
    sessionId: row.session_id,
  };
}

/**
 * Rotates the user's `session_id` to a fresh random value and returns
 * the new id. Call this on every successful login / setup / invite
 * acceptance / MFA verify / logout — any cookie issued before this
 * point will now be rejected by `authenticate` (v0.26.0+).
 */
export function rotateUserSessionId(userId: string): string {
  const next = randomUUID().replace(/-/g, '');
  db.prepare('UPDATE users SET session_id = ? WHERE id = ?').run(next, userId);
  return next;
}

// Placeholder prefix used as the password hash for accounts that were
// created by an administrator but have not yet accepted their invitation.
const PENDING_PASSWORD_PREFIX = 'PENDING:';

/** Builds the placeholder password hash for a freshly invited account. */
export function pendingPasswordHash(uniqueSuffix: string): string {
  return `${PENDING_PASSWORD_PREFIX}${uniqueSuffix}`;
}

/**
 * Returns true when the account has not yet accepted its invitation, i.e.
 * the password is still the placeholder set by the administrator at
 * creation time.
 */
export function needsActivation(user: UserRecord): boolean {
  return user.passwordHash.startsWith(PENDING_PASSWORD_PREFIX);
}

/** Counts how many accounts exist (used to detect the first run). */
export function countUsers(): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM users')
    .get() as { count: number };
  return row.count;
}

/** Counts how many administrator accounts exist. */
export function countAdmins(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'")
    .get() as { count: number };
  return row.count;
}

/** Finds a user by email address, or returns null. */
export function findUserByEmail(email: string): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | UserRow
    | undefined;
  return row ? toRecord(row) : null;
}

/** Finds a user by username (case-insensitive), or returns null. */
export function findUserByUsername(username: string): UserRecord | null {
  const row = db
    .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)')
    .get(username) as UserRow | undefined;
  return row ? toRecord(row) : null;
}

/** Finds a user by id, or returns null. */
export function findUserById(id: string): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  return row ? toRecord(row) : null;
}

/** Lists every user, newest first. */
export function listAllUsers(): UserRecord[] {
  const rows = db
    .prepare('SELECT * FROM users ORDER BY created_at DESC')
    .all() as unknown as UserRow[];
  return rows.map(toRecord);
}

/** Creates a new user account and returns the stored record. */
export function createUser(input: {
  email: string;
  username: string;
  passwordHash: string;
  role: string;
}): UserRecord {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, username, password_hash, role)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.email, input.username, input.passwordHash, input.role);

  const created = findUserById(id);
  if (!created) {
    throw new Error('Failed to create the user.');
  }
  return created;
}

/** Updates a user's password hash. */
export function setUserPassword(userId: string, passwordHash: string): void {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    passwordHash,
    userId,
  );
}

/**
 * v0.33.0+: updates an admin-editable subset of a user's profile —
 * username, email and role. Pass `undefined` for any field that
 * should be left unchanged. The caller is responsible for uniqueness
 * checks and role-related guards (last-admin, self-demote).
 */
export function updateUser(
  userId: string,
  fields: { username?: string; email?: string; role?: string },
): void {
  if (fields.username !== undefined) {
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(
      fields.username,
      userId,
    );
  }
  if (fields.email !== undefined) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(
      fields.email,
      userId,
    );
  }
  if (fields.role !== undefined) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(
      fields.role,
      userId,
    );
  }
}

/** Removes a user row. The caller must delete dependent servers first. */
export function deleteUserById(userId: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}
