import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters (v0.34.0+, parallelism re-aligned in v0.42.0).
 *
 * Argon2id is the variant recommended by RFC 9106 (2021), OWASP
 * Password Storage Cheat Sheet (current 2025/2026 edition) and
 * NIST SP 800-63B Rev. 4 (July 2025). It combines Argon2i's
 * side-channel resistance with Argon2d's GPU/ASIC resistance.
 *
 * Current parameters — tuned for a modest VPS:
 *   - memoryCost  = 65536 KiB (64 MiB)   — well above OWASP's 19 MiB floor
 *   - timeCost    = 3                    — OWASP-recommended range t=2..5
 *   - parallelism = 1                    — per RFC 9106 §4 and every
 *                                          OWASP-listed config
 *
 * Why parallelism dropped from 4 → 1 in v0.42.0: OWASP's current
 * config matrix uses p=1 for every memory/time pair, and RFC 9106 §4
 * explicitly recommends p=1 unless multi-threaded hashing is the
 * application's bottleneck (it isn't — interactive logins are
 * latency-bounded, not throughput-bounded, and `@node-rs/argon2`
 * already runs each hash on a libuv worker thread without parallelism
 * > 1 needed). Setting p=1 also makes the hash deterministic across
 * machines with different CPU core counts, which is the canonical
 * default the spec expects.
 *
 * Backward compatibility: existing hashes were stored with their
 * own params encoded into the `$argon2id$v=19$m=…,t=…,p=4$…` PHC
 * string. `verify()` parses those params from the hash itself, so
 * every old password keeps verifying without a re-hash. New
 * passwords (sign-ups, password changes) use the p=1 params.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
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
