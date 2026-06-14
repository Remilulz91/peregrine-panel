/**
 * Optional read-only integration with the host's fail2ban database
 * for the admin Security dashboard (v0.39.0+).
 *
 * # How this works
 *
 * fail2ban persists its banned-IP state in a SQLite database at
 * `/var/lib/fail2ban/fail2ban.sqlite3` on Debian / Ubuntu. We DO NOT
 * exec `fail2ban-client`: the panel container is hardened (no curl,
 * no tar, no shell helpers), and we explicitly do not want it to be
 * able to mutate the host's firewall state. Instead, the operator
 * bind-mounts the fail2ban DB **read-only** at a known path inside
 * the container (recommended `/host/fail2ban/fail2ban.sqlite3`),
 * exposes the path via the `FAIL2BAN_DB_PATH` env var, and we open
 * that file in immutable mode via SQLite's URI form.
 *
 * # Failure modes
 *
 * If `FAIL2BAN_DB_PATH` is unset, missing, unreadable, or the file
 * doesn't have the expected `bips` table, the dashboard renders a
 * friendly "fail2ban not configured (see HARDENING.md §8)" callout.
 * No error is propagated to the caller — the panel keeps working.
 *
 * # Schema
 *
 * fail2ban's relevant table (v0.11+):
 *
 *   bips(ip TEXT, jail TEXT, timeofban INTEGER, bantime INTEGER, …)
 *
 * `timeofban` is a Unix epoch in seconds; `bantime` is the duration
 * in seconds (or -1 for a permanent ban — uncommon). A ban is active
 * iff `bantime = -1` OR `timeofban + bantime > now`.
 */

import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export interface BannedIp {
  jail: string;
  ip: string;
  /** Unix epoch seconds when the ban started. */
  bannedAt: number;
  /** Duration of the ban in seconds. -1 = permanent. */
  bantime: number;
  /** Unix epoch seconds when the ban expires. null = permanent. */
  expiresAt: number | null;
  /**
   * v0.42.0+: number of times THIS (jail, ip) tuple has been
   * banned, ever. fail2ban increments this on every re-ban (it's
   * the foundation of the ban-time-increment feature). A high
   * `bancount` on an active row tells the admin "this IP is a
   * recidivist", which is the most useful single column for
   * triaging the dashboard.
   */
  bancount: number;
}

export type Fail2banStatus =
  | { available: true; bans: BannedIp[]; jails: string[] }
  | { available: false; reason: 'not_configured' | 'unreadable' | 'bad_schema' };

const DEFAULT_PATH = '/host/fail2ban/fail2ban.sqlite3';

/**
 * Returns the configured path to the fail2ban SQLite DB, or null if
 * the integration is disabled.
 *
 *   - `FAIL2BAN_DB_PATH=""`              → disabled (explicit opt-out)
 *   - `FAIL2BAN_DB_PATH=/some/path.db`   → use that path
 *   - unset                              → try the default mount path
 */
function configuredPath(): string | null {
  const env = process.env.FAIL2BAN_DB_PATH;
  if (env === undefined) return DEFAULT_PATH;
  const trimmed = env.trim();
  if (trimmed === '') return null;
  return trimmed;
}

/**
 * Opens the fail2ban DB read-only. Node 22's `node:sqlite` accepts
 * `readOnly: true` at runtime, mapping to `SQLITE_OPEN_READONLY`
 * inside libsqlite — fail2ban can still write through its own
 * handle on the host, but our process is incapable of writing
 * even if we wanted to.
 *
 * The `as` cast is because `@types/node@22.10.x` predates the
 * `readOnly` option's addition to the type declarations (the
 * runtime accepts it; the types haven't caught up). When we bump
 * `@types/node` past the release that ships the type, this cast
 * can be removed.
 */
function openReadOnly(filePath: string): DatabaseSync {
  // @ts-expect-error — `readOnly` is accepted at runtime by Node 22
  // but not yet in @types/node 22.10.x. Remove this directive when
  // @types/node ships the option in DatabaseSyncOptions.
  return new DatabaseSync(filePath, { readOnly: true });
}

/**
 * Snapshot of the currently active fail2ban bans + the list of jails
 * the operator has configured. Cheap to call (a single full-table
 * scan of `bips`, which is small even on busy hosts) but should not
 * be hammered — the admin Security page polls at ~30 s.
 */
export function readFail2banStatus(): Fail2banStatus {
  const filePath = configuredPath();
  if (filePath === null) {
    return { available: false, reason: 'not_configured' };
  }
  if (!existsSync(filePath)) {
    return { available: false, reason: 'not_configured' };
  }

  let database: DatabaseSync;
  try {
    database = openReadOnly(filePath);
  } catch {
    return { available: false, reason: 'unreadable' };
  }

  try {
    // Sanity-check the schema; if `bips` isn't there, this isn't a
    // fail2ban DB. Returns the table row count if the table exists.
    const schemaCheck = database
      .prepare(
        `SELECT COUNT(*) AS n FROM sqlite_master
          WHERE type = 'table' AND name = 'bips'`,
      )
      .get() as { n: number } | undefined;
    if (!schemaCheck || schemaCheck.n === 0) {
      return { available: false, reason: 'bad_schema' };
    }

    // Active bans only — fail2ban also keeps historical rows where
    // (timeofban + bantime) <= now. We hide those from the dashboard.
    // v0.42.0+: also fetch `bancount` so the UI can flag recidivists.
    const now = Math.floor(Date.now() / 1000);
    const rows = database
      .prepare(
        `SELECT jail, ip, timeofban, bantime, bancount
           FROM bips
          WHERE bantime = -1
             OR (timeofban + bantime) > ?
          ORDER BY timeofban DESC`,
      )
      .all(now) as Array<{
        jail: string;
        ip: string;
        timeofban: number;
        bantime: number;
        bancount: number | null;
      }>;

    const bans: BannedIp[] = rows.map((row) => ({
      jail: row.jail,
      ip: row.ip,
      bannedAt: row.timeofban,
      bantime: row.bantime,
      expiresAt: row.bantime === -1 ? null : row.timeofban + row.bantime,
      // fail2ban's column has a default of 1; coerce a NULL (some
      // legacy databases predate the column) to 1 as a safe floor.
      bancount: Number(row.bancount ?? 1),
    }));

    // The list of jails the operator has configured, even those with
    // zero active bans (useful so the UI can say "0 active bans in
    // sshd" rather than "fail2ban returned nothing, is it working?").
    const jailRows = database
      .prepare(`SELECT name FROM jails ORDER BY name ASC`)
      .all() as Array<{ name: string }>;
    const jails = jailRows.map((row) => row.name);

    return { available: true, bans, jails };
  } catch {
    return { available: false, reason: 'bad_schema' };
  } finally {
    try {
      database.close();
    } catch {
      // Ignored — DB was opened read-only; close failures are harmless.
    }
  }
}
