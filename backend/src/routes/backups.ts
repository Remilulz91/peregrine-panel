import fs from 'node:fs';
import { logAuditEvent } from '../lib/auditEvents';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { accessibleServer, requirePermission } from '../lib/acl';
import { PERMISSION } from '../lib/permissions';
import { getContainerState } from '../lib/docker';
import { logActivity } from '../lib/activity';
import { getDiskUsage } from '../lib/disk';
import { config } from '../config';
import {
  createBackup,
  deleteBackupFiles,
  DiskFullError,
  getBackupForServer,
  restoreBackup,
} from '../services/backups';
import {
  listBackupsForServer,
  MAX_BACKUPS_PER_SERVER,
  type BackupRecord,
} from '../lib/backups';

interface CreateBackupBody {
  name?: string;
}

/** Shapes a backup record for the API response (file path stays internal). */
function publicBackup(backup: BackupRecord) {
  return {
    id: backup.id,
    serverId: backup.serverId,
    name: backup.name,
    sizeBytes: backup.sizeBytes,
    createdAt: backup.createdAt,
    createdByUsername: backup.createdByUsername,
  };
}

/** Shapes a disk usage payload, only exposing the bytes. */
function publicDiskUsage(path: string) {
  return getDiskUsage(path).then((usage) => ({
    totalBytes: usage.totalBytes,
    freeBytes: usage.freeBytes,
    usedBytes: usage.usedBytes,
    reservedBytes: usage.reservedBytes,
  }));
}

/**
 * Per-server backup routes and the global disk-usage endpoint.
 *   GET    /api/disk                                  - disk usage
 *   GET    /api/servers/:id/backups                   - list (visibility only)
 *   POST   /api/servers/:id/backups                   - create (backups.create)
 *   DELETE /api/servers/:id/backups/:backupId         - delete (backups.delete)
 *   POST   /api/servers/:id/backups/:backupId/restore - restore (backups.restore)
 *   GET    /api/servers/:id/backups/:backupId/download - download (backups.download)
 */
export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/disk', async () => {
    return { usage: await publicDiskUsage(config.backupsPath) };
  });

  app.get('/servers/:id/backups', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) return reply.code(404).send({ error: 'Server not found.' });
    return {
      backups: listBackupsForServer(server.id).map(publicBackup),
      max: MAX_BACKUPS_PER_SERVER,
    };
  });

  app.post(
    '/servers/:id/backups',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', maxLength: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requirePermission(request, reply, server, PERMISSION.BACKUPS_CREATE)) return;

      const body = (request.body ?? {}) as CreateBackupBody;
      const name = body.name?.trim() || defaultBackupName();
      try {
        const backup = await createBackup({
          server,
          name,
          createdBy: request.user.sub,
        });
        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'backup.create',
          details: name,
        });
        return reply.code(201).send({ backup: publicBackup(backup) });
      } catch (err) {
        if (err instanceof DiskFullError) {
          return reply.code(507).send({
            error:
              'Not enough free disk space to create this backup. ' +
              'Delete some backups or free space and try again.',
          });
        }
        request.log.error({ err }, 'backup creation failed');
        return reply
          .code(500)
          .send({ error: 'Could not create the backup.' });
      }
    },
  );

  app.delete(
    '/servers/:id/backups/:backupId',
    async (request, reply) => {
      const { id, backupId } = request.params as {
        id: string;
        backupId: string;
      };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requirePermission(request, reply, server, PERMISSION.BACKUPS_DELETE)) return;
      const backup = getBackupForServer(backupId, server.id);
      if (!backup) {
        return reply.code(404).send({ error: 'Backup not found.' });
      }
      deleteBackupFiles(backup);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'backup.delete',
        details: backup.name,
      });
      return { ok: true };
    },
  );

  app.post(
    '/servers/:id/backups/:backupId/restore',
    async (request, reply) => {
      const { id, backupId } = request.params as {
        id: string;
        backupId: string;
      };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requirePermission(request, reply, server, PERMISSION.BACKUPS_RESTORE)) return;
      const backup = getBackupForServer(backupId, server.id);
      if (!backup) {
        return reply.code(404).send({ error: 'Backup not found.' });
      }
      if (server.containerId) {
        const state = await getContainerState(server.containerId);
        if (state === 'running') {
          return reply.code(409).send({
            error: 'Stop the server before restoring a backup.',
          });
        }
      }
      try {
        await restoreBackup(backup);
        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'backup.restore',
          details: backup.name,
        });
        return { ok: true };
      } catch (err) {
        if (err instanceof DiskFullError) {
          return reply.code(507).send({
            error: 'Not enough free disk space to restore this backup.',
          });
        }
        request.log.error({ err }, 'backup restore failed');
        return reply
          .code(500)
          .send({ error: 'Could not restore the backup.' });
      }
    },
  );

  app.get(
    '/servers/:id/backups/:backupId/download',
    async (request, reply) => {
      const { id, backupId } = request.params as {
        id: string;
        backupId: string;
      };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requirePermission(request, reply, server, PERMISSION.BACKUPS_DOWNLOAD)) return;
      const backup = getBackupForServer(backupId, server.id);
      if (!backup) {
        return reply.code(404).send({ error: 'Backup not found.' });
      }
      if (!fs.existsSync(backup.filePath)) {
        return reply.code(404).send({ error: 'Backup file is missing.' });
      }
      const safeName = backup.name.replace(/[^A-Za-z0-9._-]/g, '_');
      // v0.34.0+: audit the backup download for forensic reconstruction.
      logAuditEvent({
        kind: 'audit.backup_download',
        actorId: request.user.sub,
        serverId: server.id,
        remoteIp: request.ip,
        details: backup.name,
      });
      reply
        .header('Content-Type', 'application/gzip')
        .header(
          'Content-Disposition',
          `attachment; filename="${safeName || 'backup'}.tar.gz"`,
        );
      return reply.send(fs.createReadStream(backup.filePath));
    },
  );
}

/** Generates a default backup name like "backup 2026-05-27 18:43". */
function defaultBackupName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `backup ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
