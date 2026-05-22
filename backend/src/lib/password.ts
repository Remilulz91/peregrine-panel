import { hash, verify } from '@node-rs/argon2';

/**
 * Hashes a plain-text password with Argon2 so it can be stored safely.
 * The original password is never kept anywhere.
 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain);
}

/**
 * Checks a plain-text password against a stored Argon2 hash.
 * Returns false instead of throwing if the stored hash is invalid.
 */
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
