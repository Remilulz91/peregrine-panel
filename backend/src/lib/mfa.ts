import { randomBytes } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import { db } from './db';
import { findUserById, type UserRecord } from './users';

/** How many one-time recovery codes are issued when MFA is enabled. */
export const RECOVERY_CODES_COUNT = 8;

/** Returns true when this account has MFA active. */
export function userHasMfa(user: UserRecord): boolean {
  return Boolean(user.mfaSecret);
}

/**
 * Generates a single human-friendly recovery code:
 *   "XXXXX-XXXXX" — 10 hex chars split by a dash for readability.
 * Argon2-hashed before storage; the caller shows the plain text to the
 * user once, then it's gone forever.
 */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(5).toString('hex'); // 10 chars
  return `${bytes.slice(0, 5)}-${bytes.slice(5)}`.toUpperCase();
}

/** Generates the full set of recovery codes shown at MFA setup time. */
export function generateRecoveryCodes(
  count = RECOVERY_CODES_COUNT,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(generateRecoveryCode());
  }
  return out;
}

/** Hashes each plain-text code with Argon2 for safe storage. */
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => argonHash(c)));
}

/**
 * Persists the MFA secret + hashed recovery codes on a user account.
 * The plain-text recovery codes are NOT stored — the caller must have
 * shown them to the user already.
 */
export function persistMfa(input: {
  userId: string;
  secret: string;
  hashedRecoveryCodes: string[];
}): void {
  db.prepare(
    `UPDATE users
       SET mfa_secret = ?, mfa_recovery_codes = ?
     WHERE id = ?`,
  ).run(
    input.secret,
    JSON.stringify(input.hashedRecoveryCodes),
    input.userId,
  );
}

/** Wipes the MFA secret + recovery codes from a user account. */
export function disableMfa(userId: string): void {
  db.prepare(
    'UPDATE users SET mfa_secret = NULL, mfa_recovery_codes = NULL WHERE id = ?',
  ).run(userId);
}

/**
 * Tries to spend one recovery code. Walks every stored hash and Argon2-
 * verifies against the candidate. On a match, the hash is removed from
 * the list (single-use). Returns true if the code was valid.
 *
 * The work factor of Argon2 means this is intentionally slow — at most
 * RECOVERY_CODES_COUNT verifications, which is fine for a rare flow.
 */
export async function consumeRecoveryCode(
  userId: string,
  candidate: string,
): Promise<boolean> {
  const user = findUserById(userId);
  if (!user || !user.mfaRecoveryCodes) return false;

  const codes: string[] = (() => {
    try {
      const parsed: unknown = JSON.parse(user.mfaRecoveryCodes);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  })();

  // Normalise: case-insensitive, strip dashes/whitespace for forgiving
  // user input. Recovery codes are alphanumeric so this can't change
  // their identity in any meaningful way.
  const cleaned = candidate.trim().toUpperCase();
  if (cleaned.length === 0) return false;

  for (let i = 0; i < codes.length; i++) {
    let matched = false;
    try {
      matched = await argonVerify(codes[i], cleaned);
    } catch {
      // Skip malformed hashes.
    }
    if (matched) {
      const remaining = [...codes.slice(0, i), ...codes.slice(i + 1)];
      db.prepare('UPDATE users SET mfa_recovery_codes = ? WHERE id = ?').run(
        JSON.stringify(remaining),
        userId,
      );
      return true;
    }
  }
  return false;
}

/** Returns the number of unused recovery codes left on an account. */
export function remainingRecoveryCodes(user: UserRecord): number {
  if (!user.mfaRecoveryCodes) return 0;
  try {
    const parsed: unknown = JSON.parse(user.mfaRecoveryCodes);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
