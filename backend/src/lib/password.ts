import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters (v0.34.0+).
 *
 * Argon2id is the variant recommended by RFC 9106 (2021) and OWASP —
 * it combines Argon2i's side-channel resistance with Argon2d's
 * GPU/ASIC resistance. Tuned for a modest VPS:
 *   - memoryCost  = 65536 KiB (64 MiB)
 *   - timeCost    = 3
 *   - parallelism = 4
 * ~150 ms on a typical 2-core VPS, within OWASP "interactive login"
 * guidelines. Existing Argon2i / Argon2d hashes keep verifying because
 * `verify()` reads the variant from the hash's `$argon2X$` prefix.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const;

/** Hashes a plain-text password with Argon2id. */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/** Verifies a plain-text password against a stored Argon2 hash (any variant). */
export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}
