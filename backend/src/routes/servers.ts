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
import { deprovisionServer, provisionServer } from '../services/provisioning';

interface CreateServerBody {
  name: string;
  templateId: string;
  minecraftVersion?: string;
  memoryMb: number;
}

/** Shapes a server for the API response. */
function publicServer(server: ServerRecord) {
  return {
    id: server.id,
    name: server.name,
    status: server.status,
    templateId: server.templateId,
    minecraftVersion: server.minecraftVersion,
    memoryMb: server.memoryMb,
    port: server.port,
    createdAt: server.createdAt,
  };
}

/**
 * Game server routes (mounted under /api). Every route here requires a
 * logged-in user.
 *   GET    /templates    - game templates available for new servers
 *   GET    /servers      - the current user's servers
 *   POST   /servers      - create a new server
 *   DELETE /servers/:id  - delete a server (container + files)
 */
export async function serverRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/templates', async () => {
    return { templates: listTemplates() };
  });

  app.get('/servers', async (request) => {
    const servers = listServersByOwner(request.user.sub);
    return { servers: servers.map(publicServer) };
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

      return reply.code(201).send({ server: publicServer(server) });
    },
  );

  app.delete('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = getServer(id);
    if (!server || server.ownerId !== request.user.sub) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    await deprovisionServer(server);
    deleteServer(server.id);
    return { ok: true };
  });
}
