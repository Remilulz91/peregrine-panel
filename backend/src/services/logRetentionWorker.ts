/**
 * Daily log-retention worker (v0.40.0+).
 *
 * Once a day (and once on process startup, to catch up after a long
 * downtime), deletes every row older than `config.logRetentionDays`
 * across the three log tables Peregrine maintains:
 *   - `auth_events`     (auth attempts, MFA, SFTP)
 *   - `audit_events`    (sensitive backend operations)
 *   - `server_activity` (user-visible server actions)
 *
 * The worker is best-effort: a failing DELETE on one table does not
 * roll back the others, and any unexpected error is logged to the
 * console rather than thrown.
 *
 * # Configuration
 *
 * The retention window is `LOG_RETENTION_DAYS` (default 30, clamped
 * 0..3650). A value of 0 disables the worker entirely — useful when
 * an operator wants to manage retention with their own tooling.
 *
 * # Why one summary audit row per run
 *
 * Inserting a `audit.logs_retention_auto` row for EACH deleted row
 * would defeat the purpose. The worker instead emits ONE summary row
 * per run with the per-table counts in `details`, e.g.
 * `"auth=42 audit=7 activity=128 retention_days=30"`. That row
 * itself survives the next retention cutoff because it is strictly
 * newer than `now - retentionDays`.
 */

import { config } from '../config';
import { logAuditEvent } from '../lib/auditEvents';
import { deleteLogsOlderThan } from './securityLog';

const TICK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h

let timer: NodeJS.Timeout | null = null;

/**
 * Runs one full retention pass. Exposed for tests and for the
 * manual "run now" code path (currently unused, kept for symmetry
 * with the other workers). Never throws.
 */
export function runLogRetentionTick(): void {
  if (config.logRetentionDays <= 0) {
    // Explicitly disabled.
    return;
  }
  try {
    const result = deleteLogsOlderThan(config.logRetentionDays);
    const total = result.authEvents + result.auditEvents + result.serverActivity;
    if (total > 0) {
      logAuditEvent({
        kind: 'audit.logs_retention_auto',
        details: `auth=${result.authEvents} audit=${result.auditEvents} ` +
          `activity=${result.serverActivity} retention_days=${config.logRetentionDays}`,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[log-retention] tick failed:', err);
  }
}

/**
 * Starts the daily retention worker. Idempotent: a second call is a
 * no-op so wiring it into `index.ts` is safe.
 *
 * Fires one tick immediately on startup so a host that's been
 * offline for a week catches up on the first start instead of
 * waiting another 24 h.
 *
 * Returns a stop function for tests.
 */
export function startLogRetentionWorker(): () => void {
  if (timer !== null) {
    return () => undefined;
  }
  if (config.logRetentionDays <= 0) {
    // Disabled — start no timer at all.
    return () => undefined;
  }

  // Catch-up tick. Run async (setImmediate) so we don't block the
  // event loop during Fastify's listen() phase.
  setImmediate(() => runLogRetentionTick());

  timer = setInterval(runLogRetentionTick, TICK_INTERVAL_MS);
  // Allow the Node process to exit even with this timer pending,
  // which matters in tests and in any non-server invocation.
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  return () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}
