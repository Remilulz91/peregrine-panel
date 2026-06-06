import { db } from './db';

/**
 * Auth event log (v0.23.0+). Records who tried to log in, when, and
 * from where. Lets an admin investigate a compromised account or
 * confirm that brute-force attempts hit the rate limit before doing
 * any damage.
 *
 * Events captured (out of the box):
 *   - auth.login              — successful password login (no MFA)
 *   - auth.login_mfa          — successful MFA verify after password
 *   - auth.login_failed       — password rejected
 *   - auth.login_rate_limited — rate-limiter blocked an attempt
 *   - auth.mfa_failed         — wrong TOTP / recovery code
 *   - auth.mfa_setup          — user enabled MFA on their account
 *   - auth.mfa_disabled       — user (or admin) disabled MFA
 *   - auth.logout             — explicit logout
 *   - auth.sftp_login         — SFTP authentication succeeded
 *   - auth.sftp_failed        — SFTP authentication failed
 *   - auth.sftp_rate_limited  — SFTP rate-limiter blocked an attempt
 *
 * The list is intentionally open — callers can pass any `kind` they
 * want. Pruning is not automatic; the table is small (one row per
 * login attempt) and can be cleaned via SQL if it ever grows.
 */
export type AuthEventKind =
  | 'auth.login'
  | 'auth.login_mfa'
  | 'auth.login_failed'
  | 'auth.login_rate_limited'
  | 'auth.mfa_failed'
  | 'auth.mfa_setup'
  | 'auth.mfa_disabled'
  | 'auth.logout'
  | 'auth.sftp_login'
  | 'auth.sftp_failed'
  | 'auth.sftp_rate_limited'
  | (string & {});

export interface AuthEventInput {
  kind: AuthEventKind;
  /** The user the event relates to, if known. */
  userId?: string | null;
  /** Username typed by the client, even if no matching user exists. */
  username?: string | null;
  /** Remote IP of the client (HTTP X-Forwarded-For or socket address). */
  remoteIp?: string | null;
  /** Optional free-text detail (truncated to 500 chars). */
  details?: string | null;
}

/** Inserts one row into `auth_events`. Never throws. */
export function logAuthEvent(input: AuthEventInput): void {
  try {
    db.prepare(
      `INSERT INTO auth_events (kind, user_id, username, remote_ip, details)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      input.kind,
      input.userId ?? null,
      input.username ?? null,
      input.remoteIp ?? null,
      (input.details ?? '').slice(0, 500) || null,
    );
  } catch {
    // The auth flow should not be blocked by a log-write failure.
  }
}
