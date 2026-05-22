import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { getTemplate, listTemplates } from '../lib/templates';
import {
  allocatePort,
  createServer,
  deleteServer,
  getServer,
  listServersByOwner,
  type ServerRecord,
} from '../lib/servers';
import {
  getContainerState,
  restartContainer,
  startContainer,
  stopContainer,
} from '../lib/docker';
import { deprovisionServer, provisionServer } from '../services/provisioning';

interface CreateServerBody {
  name: string;
  templateId: string;
  minecraftVersion?: string;
  memoryMb: number;
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
    port: server.port,
    createdAt: server.createdAt,
  };
}

/** Returns the server only if it exists and belongs to the given user. */
function ownedServer(userId: string, id: string): ServerRecord | null {
  const server = getServer(id);
  return server && server.ownerId === userId ? server : null;
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

  app.post(
    '/servers',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'templateId', 'memoryMb'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 48 },
            templateId: { type: 'string', minLength: 1 },
            minecraftVersion: { type: 'string', maxLength: 32 },
            memoryMb: { type: 'integer', minimum: 512, maximum: 16384 },
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
        port,
      });

      // Pull the image and create the container in the background, so the
      // request returns immediately. The frontend polls for the status.
      void provisionServer(server, template.dockerImage);

      return reply.code(201).send({ server: await publicServer(server) });
    },
  );

  app.delete('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = ownedServer(request.user.sub, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    await deprovisionServer(server);
    deleteServer(server.id);
    return { ok: true };
  });

  // --- Power controls: start / stop / restart ---

  app.post('/servers/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = ownedServer(request.user.sub, id);
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
    return { ok: true };
  });

  app.post('/servers/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = ownedServer(request.user.sub, id);
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
    return { ok: true };
  });

  app.post('/servers/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = ownedServer(request.user.sub, id);
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
    return { ok: true };
  });
}
