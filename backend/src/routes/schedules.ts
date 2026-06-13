import type { FastifyInstance } from 'fastify';
import { sanitizeFreeText, SanitizeError } from '../lib/sanitize';
import { authenticate } from '../plugins/auth';
import { accessibleServer, requireOwner } from '../lib/acl';
import {
  createSchedule,
  isScheduleAction,
  deleteSchedule,
  getSchedule,
  isFrequency,
  listSchedulesForServer,
  recordRunAndReschedule,
  type ScheduleRecord,
  updateSchedule,
} from '../lib/schedules';
import { getServer } from '../lib/servers';
import { createBackup, DiskFullError } from '../services/backups';
import { logActivity } from '../lib/activity';

interface ScheduleBody {
  name: string;
  /** v0.22.0+: defaults to 'backup.create'. */
  action?: string;
  /** v0.22.1+: pre-restart in-game warning lead time, in minutes. */
  warningMinutes?: number;
  frequency: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  enabled: boolean;
}

/** Shapes a schedule for the API response. */
function publicSchedule(schedule: ScheduleRecord) {
  return {
    id: schedule.id,
    serverId: schedule.serverId,
    name: schedule.name,
    action: schedule.action,
    frequency: schedule.frequency,
    hour: schedule.hour,
    minute: schedule.minute,
    dayOfWeek: schedule.dayOfWeek,
    enabled: schedule.enabled,
    warningMinutes: schedule.warningMinutes,
    lastRunAt: schedule.lastRunAt,
    nextRunAt: schedule.nextRunAt,
    createdAt: schedule.createdAt,
  };
}

// JSON-schema fragments reused by POST and PATCH.
const SCHEDULE_BODY_SCHEMA = {
  type: 'object',
  required: ['name', 'frequency', 'hour', 'minute', 'dayOfWeek', 'enabled'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 48 },
    action: { type: 'string', enum: ['backup.create', 'server.restart'] },
    frequency: { type: 'string', enum: ['hourly', 'daily', 'weekly'] },
    hour: { type: 'integer', minimum: 0, maximum: 23 },
    minute: { type: 'integer', minimum: 0, maximum: 59 },
    dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
    enabled: { type: 'boolean' },
    warningMinutes: { type: 'integer', minimum: 0, maximum: 30 },
  },
} as const;

/**
 * Scheduled-task routes (mounted under /api). Managing schedules is
 * owner-only — they are configuration, not an operation a subuser
 * should perform on someone else's behalf.
 *
 *   GET    /servers/:id/schedules                  - list
 *   POST   /servers/:id/schedules                  - create
 *   PATCH  /servers/:id/schedules/:scheduleId      - update
 *   DELETE /servers/:id/schedules/:scheduleId      - delete
 *   POST   /servers/:id/schedules/:scheduleId/run  - fire it right now
 */
export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/servers/:id/schedules', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) return reply.code(404).send({ error: 'Server not found.' });
    if (!requireOwner(request, reply, server)) return;
    return {
      schedules: listSchedulesForServer(server.id).map(publicSchedule),
    };
  });

  app.post(
    '/servers/:id/schedules',
    { schema: { body: SCHEDULE_BODY_SCHEMA } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requireOwner(request, reply, server)) return;

      const body = request.body as ScheduleBody;
      try {
        if (typeof body.name === 'string') body.name = sanitizeFreeText(body.name, 48);
      } catch (err) {
        if (err instanceof SanitizeError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
      if (!isFrequency(body.frequency)) {
        return reply.code(400).send({ error: 'Unknown frequency.' });
      }
      const action =
        body.action && isScheduleAction(body.action)
          ? body.action
          : 'backup.create';
      const schedule = createSchedule({
        serverId: server.id,
        name: body.name.trim(),
        action,
        warningMinutes: body.warningMinutes,
        frequency: body.frequency,
        hour: body.hour,
        minute: body.minute,
        dayOfWeek: body.dayOfWeek,
        enabled: body.enabled,
        createdBy: request.user.sub,
      });
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'schedule.create',
        details: schedule.name,
      });
      return reply.code(201).send({ schedule: publicSchedule(schedule) });
    },
  );

  app.patch(
    '/servers/:id/schedules/:scheduleId',
    { schema: { body: SCHEDULE_BODY_SCHEMA } },
    async (request, reply) => {
      const { id, scheduleId } = request.params as {
        id: string;
        scheduleId: string;
      };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requireOwner(request, reply, server)) return;
      const existing = getSchedule(scheduleId, server.id);
      if (!existing) {
        return reply.code(404).send({ error: 'Schedule not found.' });
      }
      const body = request.body as ScheduleBody;
      try {
        if (typeof body.name === 'string') body.name = sanitizeFreeText(body.name, 48);
      } catch (err) {
        if (err instanceof SanitizeError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
      if (!isFrequency(body.frequency)) {
        return reply.code(400).send({ error: 'Unknown frequency.' });
      }
      const updateAction =
        body.action && isScheduleAction(body.action)
          ? body.action
          : undefined;
      updateSchedule(existing.id, {
        name: body.name.trim(),
        action: updateAction,
        warningMinutes: body.warningMinutes,
        frequency: body.frequency,
        hour: body.hour,
        minute: body.minute,
        dayOfWeek: body.dayOfWeek,
        enabled: body.enabled,
      });
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'schedule.update',
        details: body.name.trim(),
      });
      const updated = getSchedule(existing.id, server.id);
      return { schedule: updated ? publicSchedule(updated) : null };
    },
  );

  app.delete(
    '/servers/:id/schedules/:scheduleId',
    async (request, reply) => {
      const { id, scheduleId } = request.params as {
        id: string;
        scheduleId: string;
      };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requireOwner(request, reply, server)) return;
      const existing = getSchedule(scheduleId, server.id);
      if (!existing) {
        return reply.code(404).send({ error: 'Schedule not found.' });
      }
      deleteSchedule(existing.id);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'schedule.delete',
        details: existing.name,
      });
      return { ok: true };
    },
  );

  // "Run now" — useful for testing the schedule does what you expect
  // without waiting for the next slot. Same disk preflight + reschedule
  // logic as the worker.
  app.post(
    '/servers/:id/schedules/:scheduleId/run',
    async (request, reply) => {
      const { id, scheduleId } = request.params as {
        id: string;
        scheduleId: string;
      };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requireOwner(request, reply, server)) return;
      const schedule = getSchedule(scheduleId, server.id);
      if (!schedule) {
        return reply.code(404).send({ error: 'Schedule not found.' });
      }
      const live = getServer(server.id);
      if (!live) return reply.code(404).send({ error: 'Server not found.' });

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `${schedule.name} — ${now.getFullYear()}-${pad(
        now.getMonth() + 1,
      )}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      try {
        await createBackup({
          server: live,
          name,
          createdBy: request.user.sub,
        });
        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'schedule.run',
          details: schedule.name,
        });
        recordRunAndReschedule(schedule.id);
        return { ok: true };
      } catch (err) {
        if (err instanceof DiskFullError) {
          return reply.code(507).send({
            error: 'Not enough free disk space to create this backup.',
          });
        }
        request.log.error({ err }, 'manual schedule run failed');
        return reply.code(500).send({ error: 'Could not run the schedule.' });
      }
    },
  );
}
