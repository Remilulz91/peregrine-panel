import {
  listDueSchedules,
  recordRunAndReschedule,
  type ScheduleRecord,
} from '../lib/schedules';
import { getServer } from '../lib/servers';
import { createBackup, DiskFullError } from './backups';
import { restartContainer, sendConsoleCommand } from '../lib/docker';
import { readRconPassword } from '../lib/properties';
import { logActivity } from '../lib/activity';

/** How often the worker wakes up and looks for due schedules. */
const TICK_MS = 60 * 1000;

/**
 * Executes one scheduled job. Currently only `backup.create` is
 * supported. Logs to the per-server activity feed regardless of the
 * outcome, so the owner can see what the panel did on their behalf.
 */
async function runOnce(schedule: ScheduleRecord): Promise<void> {
  const server = getServer(schedule.serverId);
  if (!server) {
    // The server vanished before the schedule did — should never happen
    // thanks to the cascade, but be defensive and skip silently.
    return;
  }

  if (schedule.action === 'backup.create') {
    return runBackup(schedule);
  }
  if (schedule.action === 'server.restart') {
    return runRestart(schedule);
  }
  // Unknown action — log and skip rather than crash the worker.
  logActivity({
    serverId: server.id,
    actorId: null,
    kind: 'schedule.failed',
    details: `${schedule.name}: unknown action ${schedule.action}`,
  });
}

/** Runs a scheduled backup. Same behaviour as v0.6.0. */
async function runBackup(schedule: ScheduleRecord): Promise<void> {
  const server = getServer(schedule.serverId)!;
  // Name pattern: "<schedule-name> — 2026-05-27 03:00". Helps the user
  // recognise scheduled vs. manual backups in the Backups tab.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const backupName = `${schedule.name} — ${datePart}`;

  try {
    await createBackup({
      server,
      name: backupName,
      createdBy: schedule.createdBy,
    });
    logActivity({
      serverId: server.id,
      actorId: null,
      kind: 'schedule.run',
      details: schedule.name,
    });
  } catch (err) {
    if (err instanceof DiskFullError) {
      logActivity({
        serverId: server.id,
        actorId: null,
        kind: 'schedule.skipped',
        details: `${schedule.name}: not enough free disk space`,
      });
    } else {
      logActivity({
        serverId: server.id,
        actorId: null,
        kind: 'schedule.failed',
        details: schedule.name,
      });
    }
  }
}

/** Sleeps for `ms` milliseconds. Resolves silently — used between
 *  in-game warnings before a scheduled restart. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pre-restart in-game broadcast sequence (v0.22.1+). When the schedule
 * carries a non-zero warningMinutes, the worker sends a series of RCON
 * `say` messages so players have time to log out cleanly:
 *   T-warningMinutes: "Server restarting in N minutes"
 *   T-1min:           "Server restarting in 1 minute" (if warning >= 2)
 *   T-30s:            "Server restarting in 30 seconds"
 *   T-10s:            "Server restarting in 10 seconds"
 *
 * Failures are swallowed individually — if one `say` fails the worker
 * still tries the others and the actual restart. Messages are in
 * French because that's the panel operator's main audience; future
 * releases can make this configurable.
 */
async function broadcastRestartWarnings(
  containerId: string,
  warningMinutes: number,
  /** v0.22.3+: explicit RCON password (read from server.properties). */
  rconPassword: string | undefined,
): Promise<void> {
  const say = async (msg: string): Promise<void> => {
    try {
      await sendConsoleCommand(containerId, `say [Peregrine] ${msg}`, rconPassword);
    } catch {
      // Best-effort — RCON may be down. The restart will still fire.
    }
  };

  // Initial heads-up at T-warningMinutes.
  if (warningMinutes >= 2) {
    await say(
      `Server restart in ${warningMinutes} minutes / Redémarrage dans ${warningMinutes} minutes`,
    );
    // Wait until T-1min.
    await sleep((warningMinutes - 1) * 60 * 1000);
    await say('Server restart in 1 minute / Redémarrage dans 1 minute');
    // Wait until T-30s.
    await sleep(30 * 1000);
    await say('Server restart in 30 seconds / Redémarrage dans 30 secondes');
    // Wait until T-10s.
    await sleep(20 * 1000);
    await say('Server restart in 10 seconds / Redémarrage dans 10 secondes');
    await sleep(10 * 1000);
    return;
  }
  // warningMinutes === 1: only the late warnings make sense.
  await say('Server restart in 1 minute / Redémarrage dans 1 minute');
  await sleep(30 * 1000);
  await say('Server restart in 30 seconds / Redémarrage dans 30 secondes');
  await sleep(20 * 1000);
  await say('Server restart in 10 seconds / Redémarrage dans 10 secondes');
  await sleep(10 * 1000);
}

/**
 * Runs a scheduled restart (v0.22.0+). If the server is stopped, we
 * skip (with a 'schedule.skipped' activity entry) rather than starting
 * it — the intent of a scheduled restart is "refresh a long-running
 * server", not "start one I left off".
 *
 * v0.22.1+: when `warningMinutes > 0`, broadcasts an in-game heads-up
 * sequence via RCON before the actual restart. The broadcast runs in
 * the background so the worker can keep processing other schedules in
 * the meantime — we don't await it from `runOnce`.
 */
async function runRestart(schedule: ScheduleRecord): Promise<void> {
  const server = getServer(schedule.serverId)!;
  if (!server.containerId) {
    logActivity({
      serverId: server.id,
      actorId: null,
      kind: 'schedule.skipped',
      details: `${schedule.name}: server is offline`,
    });
    return;
  }
  const containerId = server.containerId;
  const warningMinutes = schedule.warningMinutes;

  // Kick off the warning sequence + the actual restart as a detached
  // task so the worker loop isn't blocked for the full warning window.
  void (async () => {
    try {
      if (warningMinutes > 0) {
        const rconPassword = readRconPassword(server.id) ?? undefined;
        await broadcastRestartWarnings(containerId, warningMinutes, rconPassword);
      }
      await restartContainer(containerId);
      logActivity({
        serverId: server.id,
        actorId: null,
        kind: 'schedule.run',
        details:
          warningMinutes > 0
            ? `${schedule.name} (restart after ${warningMinutes}-min warning)`
            : `${schedule.name} (restart)`,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[schedule] restart failed for ${server.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      logActivity({
        serverId: server.id,
        actorId: null,
        kind: 'schedule.failed',
        details: `${schedule.name} (restart)`,
      });
    }
  })();
}

/**
 * Runs every due schedule in sequence. They're rare (at most a handful
 * per minute on a busy installation), so a serial loop keeps things
 * simple and avoids hammering Docker with parallel tar processes.
 */
async function tick(): Promise<void> {
  const due = listDueSchedules();
  for (const schedule of due) {
    await runOnce(schedule);
    // Always reschedule, even on failure — we don't want a single bad
    // run to wedge the schedule forever.
    recordRunAndReschedule(schedule.id);
  }
}

/**
 * Starts the schedule worker. Runs an initial tick after a short delay
 * (so the rest of the server has time to come up) and then every TICK_MS.
 * Returns a stop function for clean shutdown in tests.
 */
export function startScheduleWorker(): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function loop(): Promise<void> {
    if (stopped) return;
    try {
      await tick();
    } catch {
      // Never let the worker die on an unexpected error.
    }
    if (!stopped) {
      timer = setTimeout(() => void loop(), TICK_MS);
    }
  }

  // Initial delay: wait 5 s on startup so any in-flight migrations or
  // template seeding settles first.
  timer = setTimeout(() => void loop(), 5000);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
