import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../plugins/auth';
import { getServer } from '../lib/servers';
import {
  deleteEntry,
  listDirectory,
  readTextFile,
  saveUploadedFile,
  writeTextFile,
} from '../lib/files';

interface PathQuery {
  path?: string;
}

interface WriteBody {
  path: string;
  content: string;
}

/**
 * File-manager routes (mounted under /api). Every route requires a
 * logged-in user and only operates on servers that user owns.
 *   GET    /servers/:id/files  - list a directory
 *   GET    /servers/:id/file   - read a text file
 *   PUT    /servers/:id/file   - write a text file
 *   DELETE /servers/:id/file   - delete a file or directory
 *   POST   /servers/:id/files  - upload a file
 */
export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Returns the server id if the request's user is allowed to access it;
  // otherwise sends a 404 and returns null. Administrators may access any
  // server (to help with troubleshooting).
  function ownedServerId(
    request: FastifyRequest,
    reply: FastifyReply,
  ): string | null {
    const { id } = request.params as { id: string };
    const server = getServer(id);
    const allowed =
      server &&
      (request.user.role === 'ADMIN' || server.ownerId === request.user.sub);
    if (!server || !allowed) {
      reply.code(404).send({ error: 'Server not found.' });
      return null;
    }
    return server.id;
  }

  app.get('/servers/:id/files', async (request, reply) => {
    const id = ownedServerId(request, reply);
    if (!id) return reply;
    const dirPath = (request.query as PathQuery).path ?? '/';
    try {
      return { path: dirPath, entries: listDirectory(id, dirPath) };
    } catch {
      return reply.code(400).send({ error: 'Cannot read this directory.' });
    }
  });

  app.get('/servers/:id/file', async (request, reply) => {
    const id = ownedServerId(request, reply);
    if (!id) return reply;
    const filePath = (request.query as PathQuery).path;
    if (!filePath) {
      return reply.code(400).send({ error: 'Missing file path.' });
    }
    try {
      return { path: filePath, content: readTextFile(id, filePath) };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cannot read file.';
      return reply.code(400).send({ error: message });
    }
  });

  app.put(
    '/servers/:id/file',
    {
      schema: {
        body: {
          type: 'object',
          required: ['path', 'content'],
          additionalProperties: false,
          properties: {
            path: { type: 'string', minLength: 1 },
            content: { type: 'string', maxLength: 1048576 },
          },
        },
      },
    },
    async (request, reply) => {
      const id = ownedServerId(request, reply);
      if (!id) return reply;
      const { path: filePath, content } = request.body as WriteBody;
      try {
        writeTextFile(id, filePath, content);
        return { ok: true };
      } catch {
        return reply.code(400).send({ error: 'Cannot write this file.' });
      }
    },
  );

  app.delete('/servers/:id/file', async (request, reply) => {
    const id = ownedServerId(request, reply);
    if (!id) return reply;
    const target = (request.query as PathQuery).path;
    if (!target) {
      return reply.code(400).send({ error: 'Missing path.' });
    }
    try {
      deleteEntry(id, target);
      return { ok: true };
    } catch {
      return reply.code(400).send({ error: 'Cannot delete this item.' });
    }
  });

  app.post('/servers/:id/files', async (request, reply) => {
    const id = ownedServerId(request, reply);
    if (!id) return reply;
    const dirPath = (request.query as PathQuery).path ?? '/';
    const uploaded = await request.file();
    if (!uploaded) {
      return reply.code(400).send({ error: 'No file was provided.' });
    }
    try {
      const data = await uploaded.toBuffer();
      saveUploadedFile(id, dirPath, uploaded.filename, data);
      return { ok: true };
    } catch {
      return reply.code(400).send({ error: 'Cannot save the uploaded file.' });
    }
  });
}
