/**
 * Read-side queries on the `auth_events` table for the admin-only
 * Security dashboard (v0.39.0+).
 *
 * The table is already populated by every code path that touches
 * authentication (`logAuthEvent` calls in `routes/auth.ts`,
 * `lib/sftpServer.ts`, etc.). This module only EXPOSES that data —
 * it never writes.
 *
 * All exports return plain objects safe to serialize as-is to the
 * frontend; no user-controlled SQL fragments cross this boundary.
 */

import { db } from '../lib/db';

// Kinds we consider "failed authentication" for the dashboard. We
// expose them as a hardcoded list rather than reading from the
// table so a typo'd `kind` written by some other route doesn't
// silently slip into the admin view.
const FAILED_KINDS = [
  'auth.login_failed',
  'auth.login_rate_limited',
  'auth.mfa_failed',
  'auth.sftp_failed',
  'auth.sftp_rate_limited',
] as const;

/** Placeholder string of `?, ?, ?, ?, ?` for the IN clause. */
const FAILED_PLACEHOLDERS = FAILED_KINDS.map(() => '?').join(',');

// --------------------------------------------------------------------
// Shapes returned to the API
// --------------------------------------------------------------------

export interface FailedLoginRow {
  id: number;
  kind: string;
  /** Whatever the client typed in the username field, even if no user matched. */
  username: string | null;
  /** Internal user id, if the username matched an existing account. */
  userId: string | null;
  remoteIp: string | null;
  /** Free-text detail; usually short. */
  details: string | null;
  /** ISO-ish ts as written by SQLite `datetime('now')`. */
  createdAt: string;
}

export interface FailedLoginAggregateRow {
  /** Username typed by the client. NULL/empty grouped as "(unknown)". */
  username: string;
  remoteIp: string;
  attempts: number;
  /** Most recent attempt timestamp (max created_at). */
  lastAt: string;
  /** Earliest attempt timestamp within the window. */
  firstAt: string;
  /** Breakdown by kind, e.g. `{ "auth.login_failed": 5, "auth.mfa_failed": 1 }`. */
  byKind: Record<string, number>;
}

export interface FailedLoginStats {
  /** Total failed events in the last 24 h. */
  last24h: number;
  /** Total failed events in the last 7 d. */
  last7d: number;
  /** Distinct usernames + IPs targeted in the last 7 d. */
  distinctUsernames7d: number;
  distinctIps7d: number;
}

// --------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------

/**
 * Returns the most recent failed-auth rows (any kind in FAILED_KINDS),
 * newest first. Hard-capped at 500 rows so a curious admin can't
 * accidentally pull a 2 GiB payload over a single XHR.
 */
export function listRecentFailedLogins(limit = 100): FailedLoginRow[] {
  const safe = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = db
    .prepare(
      `SELECT id, kind, user_id, username, remote_ip, details, created_at
         FROM auth_events
        WHERE kind IN (${FAILED_PLACEHOLDERS})
        ORDER BY id DESC
        LIMIT ?`,
    )
    .all(...FAILED_KINDS, safe) as Array<{
      id: number;
      kind: string;
      user_id: string | null;
      username: string | null;
      remote_ip: string | null;
      details: string | null;
      created_at: string;
    }>;

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    username: row.username,
    userId: row.user_id,
    remoteIp: row.remote_ip,
    details: row.details,
    createdAt: row.created_at,
  }));
}

/**
 * Aggregates failed-auth events from the last N days by
 * (username, remote_ip). Returns the top `limit` rows ordered by
 * attempt count desc, then lastAt desc. NULL usernames are grouped
 * as the literal string "(unknown)" so the UI doesn't crash on
 * `row.username.toUpperCase()` and so different NULL-flavoured rows
 * don't all collapse into one.
 */
export function topFailedLoginOffenders(
  days = 7,
  limit = 50,
): FailedLoginAggregateRow[] {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = db
    .prepare(
      `SELECT
         COALESCE(NULLIF(username, ''), '(unknown)') AS username,
         COALESCE(NULLIF(remote_ip, ''), '(unknown)') AS remote_ip,
         COUNT(*) AS attempts,
         MAX(created_at) AS last_at,
         MIN(created_at) AS first_at
       FROM auth_events
       WHERE kind IN (${FAILED_PLACEHOLDERS})
         AND created_at > datetime('now', ?)
       GROUP BY username, remote_ip
       ORDER BY attempts DESC, last_at DESC
       LIMIT ?`,
    )
    .all(...FAILED_KINDS, `-${safeDays} days`, safeLimit) as Array<{
      username: string;
      remote_ip: string;
      attempts: number;
      last_at: string;
      first_at: string;
    }>;

  // For each (username, ip) row, also fetch the per-kind breakdown.
  // Two queries beat a single CASE-based pivot for clarity, and the
  // outer limit caps the loop count.
  const breakdownStmt = db.prepare(
    `SELECT kind, COUNT(*) AS n
       FROM auth_events
      WHERE kind IN (${FAILED_PLACEHOLDERS})
        AND created_at > datetime('now', ?)
        AND COALESCE(NULLIF(username, ''), '(unknown)') = ?
        AND COALESCE(NULLIF(remote_ip, ''), '(unknown)') = ?
      GROUP BY kind`,
  );

  return rows.map((row) => {
    const breakdown = breakdownStmt.all(
      ...FAILED_KINDS,
      `-${safeDays} days`,
      row.username,
      row.remote_ip,
    ) as Array<{ kind: string; n: number }>;
    const byKind: Record<string, number> = {};
    for (const b of breakdown) byKind[b.kind] = b.n;
    return {
      username: row.username,
      remoteIp: row.remote_ip,
      attempts: row.attempts,
      lastAt: row.last_at,
      firstAt: row.first_at,
      byKind,
    };
  });
}

// --------------------------------------------------------------------
// Write-side: manual clear + retention worker delete helpers (v0.40.0+)
// --------------------------------------------------------------------

/** Result row for any delete-batch operation. */
export interface DeleteResult {
  authEvents: number;
  auditEvents: number;
  serverActivity: number;
}

/**
 * Wipes every failed-auth row from `auth_events`. Used by the admin
 * "Clear failed logins" button on the Security dashboard. Successful
 * logins (`auth.login`, `auth.login_mfa`, `auth.logout`, etc.) and
 * MFA-setup events are PRESERVED — they're useful for forensics
 * ("when did this account last log in legitimately") and they don't
 * grow at attacker speed.
 *
 * Returns the row count. Never throws — silently returns 0 on a DB
 * error so the route stays responsive.
 */
export function clearFailedAuthEvents(): number {
  try {
    const r = db
      .prepare(
        `DELETE FROM auth_events
          WHERE kind IN (${FAILED_PLACEHOLDERS})`,
      )
      .run(...FAILED_KINDS);
    return Number(r.changes ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Deletes every log row older than the given number of days across
 * the three log tables the panel maintains. Used by the daily
 * retention worker. Returns per-table counts so the worker can audit
 * a single accurate "X rows deleted" event.
 *
 * Runs each delete in its own statement (no transaction wrapper)
 * because the queries are independent and one failing should not
 * roll back the others. Errors are swallowed per-table; the worker
 * is best-effort.
 */
export function deleteLogsOlderThan(days: number): DeleteResult {
  const safeDays = Math.max(1, Math.min(3650, Math.floor(days)));
  const window = `-${safeDays} days`;
  const result: DeleteResult = {
    authEvents: 0,
    auditEvents: 0,
    serverActivity: 0,
  };
  try {
    const r = db
      .prepare(`DELETE FROM auth_events WHERE created_at < datetime('now', ?)`)
      .run(window);
    result.authEvents = Number(r.changes ?? 0);
  } catch {
    // Ignored.
  }
  try {
    const r = db
      .prepare(`DELETE FROM audit_events WHERE created_at < datetime('now', ?)`)
      .run(window);
    result.auditEvents = Number(r.changes ?? 0);
  } catch {
    // Ignored.
  }
  try {
    const r = db
      .prepare(
        `DELETE FROM server_activity WHERE created_at < datetime('now', ?)`,
      )
      .run(window);
    result.serverActivity = Number(r.changes ?? 0);
  } catch {
    // Ignored.
  }
  return result;
}

/** High-level counts for the dashboard header. One round-trip total. */
export function failedLoginStats(): FailedLoginStats {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN created_at > datetime('now', '-1 day')  THEN 1 ELSE 0 END) AS last24h,
         SUM(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 ELSE 0 END) AS last7d,
         COUNT(DISTINCT CASE
           WHEN created_at > datetime('now', '-7 days')
             AND username IS NOT NULL AND username != ''
           THEN username END) AS distinct_usernames_7d,
         COUNT(DISTINCT CASE
           WHEN created_at > datetime('now', '-7 days')
             AND remote_ip IS NOT NULL AND remote_ip != ''
           THEN remote_ip END) AS distinct_ips_7d
       FROM auth_events
       WHERE kind IN (${FAILED_PLACEHOLDERS})`,
    )
    .get(...FAILED_KINDS) as
    | {
        last24h: number | null;
        last7d: number | null;
        distinct_usernames_7d: number | null;
        distinct_ips_7d: number | null;
      }
    | undefined;

  return {
    last24h: row?.last24h ?? 0,
    last7d: row?.last7d ?? 0,
    distinctUsernames7d: row?.distinct_usernames_7d ?? 0,
    distinctIps7d: row?.distinct_ips_7d ?? 0,
  };
}
