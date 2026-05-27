import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { getTemplate, listTemplates } from '../lib/templates';
import {
  allocatePort,
  createServer,
  deleteServer,
  getServer,
  listServersVisibleTo,
  renameServer,
  type ServerRecord,
} from '../lib/servers';
import { findUserById } from '../lib/users';
import { effectivePermissions } from '../lib/subusers';
import { PERMISSION } from '../lib/permissions';
import {
  accessibleServer,
  requireOwner,
  requirePermission,
} from '../lib/acl';
import {
  getContainerState,
  restartContainer,
  startContainer,
  stopContainer,
} from '../lib/docker';
import { deprovisionServer, provisionServer } from '../services/provisioning';
import { listActivityForServer, logActivity } from '../lib/activity';
import { assertEnoughFreeSpace, DiskFullError } from '../lib/disk';
import { deleteAllBackupsForServer } from '../services/backups';
import { config } from '../config';

interface CreateServerBody {
  name: string;
  templateId: string;
  minecraftVersion?: string;
  memoryMb: number;
  cpuLimit: number;
}

interface RenameServerBody {
  name: string;
}

/**
 * Computes the status to show the user. While a server is still being
 * installed we trust the database; once installed, we ask Docker for the
 * real container state (running or not).
 */
async function effectiveStatus(server: ServerRecord): Promise<string> {
  if (server.status === 'INSTALLING' || server.status === 'INSTALL_FAILED') {
    return server.status;
  }
  if (!server.containerId) {
    return 'OFFLINE';
  }
  const state = await getContainerState(server.containerId);
  return state === 'running' ? 'RUNNING' : 'OFFLINE';
}

/**
 * Shapes a server for the API response, from the perspective of a given
 * viewer. Includes the owner's username plus `isOwner`, so the dashboard
 * can tag servers shared with the viewer.
 */
async function publicServer(server: ServerRecord, viewerId: string) {
  const owner = findUserById(server.ownerId);
  return {
    id: server.id,
    name: server.name,
    status: await effectiveStatus(server),
    templateId: server.templateId,
    minecraftVersion: server.minecraftVersion,
    memoryMb: server.memoryMb,
    cpuLimit: server.cpuLimit,
    port: server.port,
    createdAt: server.createdAt,
    isOwner: server.ownerId === viewerId,
    ownerUsername: owner?.username ?? '?',
  };
}

/**
 * Game server routes (mounted under /api). Every route here requires a
 * logged-in user.
 */
export async function serverRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/templates', async () => {
    return { templates: listTemplates() };
  });

  app.get('/servers', async (request) => {
    const servers = listServersVisibleTo(request.user.sub);
    const result = await Promise.all(
      servers.map((s) => publicServer(s, request.user.sub)),
    );
    return { servers: result };
  });

  // Single-server endpoint — also returns `myPermissions` so the UI
  // knows which buttons to hide.
  app.get('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    const myPermissions = effectivePermissions({
      serverId: server.id,
      userId: request.user.sub,
      role: request.user.role,
      ownerId: server.ownerId,
    });
    return {
      server: await publicServer(server, request.user.sub),
      myPermissions,
    };
  });

  app.post(
    '/servers',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'templateId', 'memoryMb', 'cpuLimit'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 48 },
            templateId: { type: 'string', minLength: 1 },
            minecraftVersion: { type: 'string', maxLength: 32 },
            memoryMb: { type: 'integer', minimum: 512, maximum: 16384 },
            cpuLimit: { type: 'number', minimum: 0.5, maximum: 16 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as CreateServerBody;

      const template = getTemplate(body.templateId);
      if (!template) {
        return reply.code(400).send({ error: 'Unknown game template.' });
      }

      try {
        await assertEnoughFreeSpace(config.serversPath, 2 * 1024 * 1024 * 1024);
      } catch (err) {
        if (err instanceof DiskFullError) {
          return reply.code(507).send({
            error:
              'Not enough free disk space to create a new server. ' +
              'Delete unused servers or backups and try again.',
          });
        }
        throw err;
      }

      let port: number;
      try {
        port = allocatePort();
      } catch {
        return reply
          .code(409)
          .send({ error: 'No free port available on this machine.' });
      }

      const server = createServer({
        ownerId: request.user.sub,
        templateId: template.id,
        name: body.name,
        minecraftVersion:
          body.minecraftVersion?.trim() || template.defaultVersion,
        memoryMb: body.memoryMb,
        cpuLimit: body.cpuLimit,
        port,
      });

      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.create',
      });

      void provisionServer(server, template);

      return reply
        .code(201)
        .send({ server: await publicServer(server, request.user.sub) });
    },
  );

  app.patch(
    '/servers/:id',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 48 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) {
        return reply.code(404).send({ error: 'Server not found.' });
      }
      if (!requirePermission(request, reply, server, PERMISSION.SETTINGS_RENAME)) return;
      const { name } = request.body as RenameServerBody;
      const newName = name.trim();
      if (newName.length === 0) {
        return reply.code(400).send({ error: 'Name cannot be empty.' });
      }
      if (newName !== server.name) {
        renameServer(server.id, newName);
        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'server.rename',
          details: `${server.name} → ${newName}`,
        });
      }
      const updated = getServer(server.id);
      return {
        server: updated && (await publicServer(updated, request.user.sub)),
      };
    },
  );

  app.delete('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    if (!requireOwner(request, reply, server)) return;
    if (server.containerId) {
      const state = await getContainerState(server.containerId);
      if (state === 'running') {
        return reply.code(409).send({
          error: 'Stop the server before deleting it.',
        });
      }
    }
    logActivity({
      serverId: server.id,
      actorId: request.user.sub,
      kind: 'server.delete',
      details: server.name,
    });
    await deprovisionServer(server);
    deleteAllBackupsForServer(server.id);
    deleteServer(server.id);
    return { ok: true };
  });

  app.post('/servers/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    if (!requirePermission(request, reply, server, PERMISSION.CONTROL_START)) return;
    if (!server.containerId) {
      return reply.code(409).send({ error: 'Server is not ready yet.' });
    }
    try {
      await startContainer(server.containerId);
    } catch {
      return reply.code(502).send({ error: 'Could not start the server.' });
    }
    logActivity({
      serverId: server.id,
      actorId: request.user.sub,
      kind: 'server.start',
    });
    return { ok: true };
  });

  app.post('/servers/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    if (!requirePermission(request, reply, server, PERMISSION.CONTROL_STOP)) return;
    if (!server.containerId) {
      return reply.code(409).send({ error: 'Server is not ready yet.' });
    }
    try {
      await stopContainer(server.containerId);
    } catch {
      return reply.code(502).send({ error: 'Could not stop the server.' });
    }
    logActivity({
      serverId: server.id,
      actorId: request.user.sub,
      kind: 'server.stop',
    });
    return { ok: true };
  });

  app.post('/servers/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    if (!requirePermission(request, reply, server, PERMISSION.CONTROL_RESTART)) return;
    if (!server.containerId) {
      return reply.code(409).send({ error: 'Server is not ready yet.' });
    }
    try {
      await restartContainer(server.containerId);
    } catch {
      return reply.code(502).send({ error: 'Could not restart the server.' });
    }
    logActivity({
      serverId: server.id,
      actorId: request.user.sub,
      kind: 'server.restart',
    });
    return { ok: true };
  });

  app.get('/servers/:id/activity', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    return { entries: listActivityForServer(server.id, 100) };
  });
}
