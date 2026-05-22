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
}

// The raw row shape stored in SQLite (snake_case column names).
interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

/** Counts how many accounts exist (used to detect the first run). */
export function countUsers(): number {
  const row = db
    .prepare('SELECT COUNT(*) AS count FROM users')
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

/** Finds a user by id, or returns null. */
export function findUserById(id: string): UserRecord | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  return row ? toRecord(row) : null;
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
