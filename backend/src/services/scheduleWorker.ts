import {
  listDueSchedules,
  recordRunAndReschedule,
  type ScheduleRecord,
} from '../lib/schedules';
import { getServer } from '../lib/servers';
import { createBackup, DiskFullError } from './backups';
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

  // The only action supported in v0.6.0.
  if (schedule.action !== 'backup.create') {
    return;
  }

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
      // Schedules are owned by the panel; attribute the run to the
      // creator if we know them, otherwise leave actor empty.
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
      // Disk too tight to take a backup right now. Skip this occurrence
      // and let the next one try — better than crashing the worker.
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
