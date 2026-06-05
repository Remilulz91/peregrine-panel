import { randomUUID } from 'node:crypto';
import { db } from './db';

/** Supported recurrence frequencies, in order of "how often". */
export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly';
const FREQ_SET: ReadonlySet<string> = new Set(['hourly', 'daily', 'weekly']);

/**
 * Supported scheduled actions (v0.22.0+):
 *   - 'backup.create' — snapshot the server's data folder
 *   - 'server.restart' — gracefully restart the container (libère la mémoire,
 *      utile pour des serveurs Java qui tournent en 24/7)
 */
export type ScheduleAction = 'backup.create' | 'server.restart';
const ACTION_SET: ReadonlySet<string> = new Set(['backup.create', 'server.restart']);

export function isScheduleAction(value: string): value is ScheduleAction {
  return ACTION_SET.has(value);
}

/** A scheduled task, as used inside the backend. */
export interface ScheduleRecord {
  id: string;
  serverId: string;
  name: string;
  action: ScheduleAction;
  frequency: ScheduleFrequency;
  /** Hour (0–23). Ignored for `hourly`. */
  hour: number;
  /** Minute (0–59). */
  minute: number;
  /** Day of week (0=Sunday … 6=Saturday). Ignored unless `weekly`. */
  dayOfWeek: number;
  enabled: boolean;
  /** ISO timestamp of the last successful run, or null. */
  lastRunAt: string | null;
  /** ISO timestamp of the next scheduled run. */
  nextRunAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface ScheduleRow {
  id: string;
  server_id: string;
  name: string;
  action: string;
  frequency: string;
  hour: number;
  minute: number;
  day_of_week: number;
  enabled: number;
  last_run_at: string | null;
  next_run_at: string | null;
  created_by: string | null;
  created_at: string;
}

function toRecord(row: ScheduleRow): ScheduleRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    action: row.action as ScheduleAction,
    frequency: row.frequency as ScheduleFrequency,
    hour: row.hour,
    minute: row.minute,
    dayOfWeek: row.day_of_week,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/** True if the given value is one of the supported frequencies. */
export function isFrequency(value: string): value is ScheduleFrequency {
  return FREQ_SET.has(value);
}

/**
 * Returns the next Date at which a schedule should fire, strictly after
 * the given `from` instant (defaults to "now"). The computation is local
 * to the server's timezone: hour/minute/dayOfWeek are interpreted in the
 * Node process's local zone, which is whatever the host is configured for.
 *
 * Logic:
 *  - `hourly`: next minute boundary matching `minute`
 *  - `daily` : next time today at HH:MM; if past, tomorrow at HH:MM
 *  - `weekly`: next occurrence of the given day_of_week at HH:MM
 */
export function computeNextRun(
  input: {
    frequency: ScheduleFrequency;
    hour: number;
    minute: number;
    dayOfWeek: number;
  },
  from: Date = new Date(),
): Date {
  const next = new Date(from.getTime());
  // Clear the seconds so we land on a clean minute boundary.
  next.setSeconds(0, 0);

  if (input.frequency === 'hourly') {
    next.setMinutes(input.minute);
    if (next.getTime() <= from.getTime()) {
      next.setHours(next.getHours() + 1);
    }
    return next;
  }

  if (input.frequency === 'daily') {
    next.setHours(input.hour, input.minute, 0, 0);
    if (next.getTime() <= from.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // weekly
  next.setHours(input.hour, input.minute, 0, 0);
  // Walk forward day by day until we land on the right weekday and the
  // resulting instant is strictly in the future.
  while (
    next.getDay() !== input.dayOfWeek ||
    next.getTime() <= from.getTime()
  ) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/** Lists every schedule for a server, newest first. */
export function listSchedulesForServer(serverId: string): ScheduleRecord[] {
  const rows = db
    .prepare(
      'SELECT * FROM server_schedules WHERE server_id = ? ORDER BY created_at DESC',
    )
    .all(serverId) as unknown as ScheduleRow[];
  return rows.map(toRecord);
}

/** Lists every enabled schedule across all servers whose next_run_at is due. */
export function listDueSchedules(now: Date = new Date()): ScheduleRecord[] {
  const rows = db
    .prepare(
      `SELECT * FROM server_schedules
       WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?`,
    )
    .all(now.toISOString()) as unknown as ScheduleRow[];
  return rows.map(toRecord);
}

/** Looks up a schedule by id (optionally scoped to a server). */
export function getSchedule(
  id: string,
  serverId?: string,
): ScheduleRecord | null {
  const row = serverId
    ? (db
        .prepare(
          'SELECT * FROM server_schedules WHERE id = ? AND server_id = ?',
        )
        .get(id, serverId) as ScheduleRow | undefined)
    : (db
        .prepare('SELECT * FROM server_schedules WHERE id = ?')
        .get(id) as ScheduleRow | undefined);
  return row ? toRecord(row) : null;
}

/** Creates a new schedule, pre-computing the next run timestamp. */
export function createSchedule(input: {
  serverId: string;
  name: string;
  /** Defaults to 'backup.create' for backward compatibility. */
  action?: ScheduleAction;
  frequency: ScheduleFrequency;
  hour: number;
  minute: number;
  dayOfWeek: number;
  enabled: boolean;
  createdBy: string | null;
}): ScheduleRecord {
  const id = randomUUID();
  const action: ScheduleAction = input.action ?? 'backup.create';
  const nextRun = input.enabled ? computeNextRun(input) : null;
  db.prepare(
    `INSERT INTO server_schedules
       (id, server_id, name, action, frequency, hour, minute, day_of_week,
        enabled, next_run_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.serverId,
    input.name,
    action,
    input.frequency,
    input.hour,
    input.minute,
    input.dayOfWeek,
    input.enabled ? 1 : 0,
    nextRun?.toISOString() ?? null,
    input.createdBy,
  );
  const created = getSchedule(id);
  if (!created) throw new Error('Failed to create the schedule.');
  return created;
}

/**
 * Updates an existing schedule; recomputes next_run_at from the new
 * params. v0.22.0+: also accepts a new `action` to convert e.g. a
 * backup schedule into a restart schedule.
 */
export function updateSchedule(
  id: string,
  input: {
    name: string;
    action?: ScheduleAction;
    frequency: ScheduleFrequency;
    hour: number;
    minute: number;
    dayOfWeek: number;
    enabled: boolean;
  },
): void {
  const nextRun = input.enabled ? computeNextRun(input) : null;
  // Look up the current action so we keep it when the caller didn't
  // specify one — keeps PATCH callers from accidentally turning a
  // restart schedule back into a backup.
  const current = getSchedule(id);
  const action: ScheduleAction = input.action ?? current?.action ?? 'backup.create';
  db.prepare(
    `UPDATE server_schedules
       SET name = ?, action = ?, frequency = ?, hour = ?, minute = ?, day_of_week = ?,
           enabled = ?, next_run_at = ?
     WHERE id = ?`,
  ).run(
    input.name,
    action,
    input.frequency,
    input.hour,
    input.minute,
    input.dayOfWeek,
    input.enabled ? 1 : 0,
    nextRun?.toISOString() ?? null,
    id,
  );
}

/**
 * Records a successful run and schedules the next one. Catching-up missed
 * occurrences is intentionally NOT done — if the panel was down for 3
 * days, we skip directly to the next slot instead of firing 3 times.
 */
export function recordRunAndReschedule(id: string): void {
  const existing = getSchedule(id);
  if (!existing) return;
  const now = new Date();
  const next = existing.enabled ? computeNextRun(existing, now) : null;
  db.prepare(
    `UPDATE server_schedules
       SET last_run_at = ?, next_run_at = ?
     WHERE id = ?`,
  ).run(now.toISOString(), next?.toISOString() ?? null, id);
}

/** Removes a schedule row. */
export function deleteSchedule(id: string): void {
  db.prepare('DELETE FROM server_schedules WHERE id = ?').run(id);
}
