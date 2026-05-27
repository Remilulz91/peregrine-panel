import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '../plugins/auth';
import { getTemplate, listTemplates } from '../lib/templates';
import {
  allocatePort,
  createServer,
  deleteServer,
  getServer,
  listServersByOwner,
  renameServer,
  type ServerRecord,
} from '../lib/servers';
import {
  getContainerState,
  restartContainer,
  startContainer,
  stopContainer,
} from '../lib/docker';
import { deprovisionServer, provisionServer } from '../services/provisioning';
import { listActivityForServer, logActivity } from '../lib/activity';

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

/** Shapes a server for the API response, including its live status. */
async function publicServer(server: ServerRecord) {
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
  };
}

/**
 * Returns the server only if the request's user is allowed to act on it.
 * A regular user can only reach their own servers; an administrator can
 * reach any server (to help with troubleshooting).
 */
function accessibleServer(
  request: FastifyRequest,
  id: string,
): ServerRecord | null {
  const server = getServer(id);
  if (!server) {
    return null;
  }
  if (request.user.role === 'ADMIN' || server.ownerId === request.user.sub) {
    return server;
  }
  return null;
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
    const servers = listServersByOwner(request.user.sub);
    const result = await Promise.all(servers.map(publicServer));
    return { servers: result };
  });

  // Single-server endpoint — used by the detail page header.
  app.get('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    return { server: await publicServer(server) };
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

      // Pull the image and create the container in the background, so the
      // request returns immediately. The frontend polls for the status.
      void provisionServer(server, template);

      return reply.code(201).send({ server: await publicServer(server) });
    },
  );

  // Rename — does not touch the container, just the human-readable name.
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
      return { server: updated && (await publicServer(updated)) };
    },
  );

  app.delete('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    // Refuse to delete a server that is currently running — the user
    // (or admin) must stop it first. Prevents accidental container kill
    // mid-game.
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
    deleteServer(server.id);
    return { ok: true };
  });

  app.post('/servers/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
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

  // Activity feed (latest events first, capped server-side).
  app.get('/servers/:id/activity', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    return { entries: listActivityForServer(server.id, 100) };
  });
}
