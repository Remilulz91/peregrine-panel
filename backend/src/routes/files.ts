import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logAuditEvent } from '../lib/auditEvents';
import { sanitizeFilename, SanitizeError } from '../lib/sanitize';
import { authenticate } from '../plugins/auth';
import { accessibleServer, requirePermission } from '../lib/acl';
import { PERMISSION } from '../lib/permissions';
import type { ServerRecord } from '../lib/servers';
import {
  deleteEntry,
  listDirectory,
  readTextFile,
  saveUploadedFile,
  writeTextFile,
} from '../lib/files';
import { logActivity } from '../lib/activity';

interface PathQuery {
  path?: string;
}

interface WriteBody {
  path: string;
  content: string;
}

/**
 * File-manager routes (mounted under /api). Every route requires a
 * logged-in user. Reads are gated by visibility only (anyone with
 * access to the server can browse and view files); writes and deletes
 * require the matching files.* permission.
 *   GET    /servers/:id/files  - list a directory
 *   GET    /servers/:id/file   - read a text file
 *   PUT    /servers/:id/file   - write a text file   (files.write)
 *   DELETE /servers/:id/file   - delete an entry     (files.delete)
 *   POST   /servers/:id/files  - upload a file       (files.write)
 */
export async function fileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  // Returns the server if the request's user has visibility; otherwise
  // sends 404 and returns null. Permission checks happen at each route.
  function resolveServer(
    request: FastifyRequest,
    reply: FastifyReply,
  ): ServerRecord | null {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      reply.code(404).send({ error: 'Server not found.' });
      return null;
    }
    return server;
  }

  app.get('/servers/:id/files', async (request, reply) => {
    const server = resolveServer(request, reply);
    if (!server) return reply;
    const dirPath = (request.query as PathQuery).path ?? '/';
    try {
      return { path: dirPath, entries: listDirectory(server.id, dirPath) };
    } catch {
      return reply.code(400).send({ error: 'Cannot read this directory.' });
    }
  });

  app.get('/servers/:id/file', async (request, reply) => {
    const server = resolveServer(request, reply);
    if (!server) return reply;
    const filePath = (request.query as PathQuery).path;
    if (!filePath) {
      return reply.code(400).send({ error: 'Missing file path.' });
    }
    try {
      return { path: filePath, content: readTextFile(server.id, filePath) };
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
      const server = resolveServer(request, reply);
      if (!server) return reply;
      if (!requirePermission(request, reply, server, PERMISSION.FILES_WRITE)) return;
      const { path: filePath, content } = request.body as WriteBody;
      try {
        writeTextFile(server.id, filePath, content);
        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'files.write',
          details: filePath,
        });
        return { ok: true };
      } catch {
        return reply.code(400).send({ error: 'Cannot write this file.' });
      }
    },
  );

  app.delete('/servers/:id/file', async (request, reply) => {
    const server = resolveServer(request, reply);
    if (!server) return reply;
    if (!requirePermission(request, reply, server, PERMISSION.FILES_DELETE)) return;
    const target = (request.query as PathQuery).path;
    if (!target) {
      return reply.code(400).send({ error: 'Missing path.' });
    }
    try {
      deleteEntry(server.id, target);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'files.delete',
        details: target,
      });
      return { ok: true };
    } catch {
      return reply.code(400).send({ error: 'Cannot delete this item.' });
    }
  });

  app.post('/servers/:id/files', async (request, reply) => {
    const server = resolveServer(request, reply);
    if (!server) return reply;
    if (!requirePermission(request, reply, server, PERMISSION.FILES_WRITE)) return;
    const dirPath = (request.query as PathQuery).path ?? '/';
    const uploaded = await request.file();
    if (!uploaded) {
      return reply.code(400).send({ error: 'No file was provided.' });
    }
    try {
      const data = await uploaded.toBuffer();
      saveUploadedFile(server.id, dirPath, uploaded.filename, data);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'files.upload',
        details: `${dirPath.replace(/\/+$/, '')}/${uploaded.filename}`,
      });
      return { ok: true };
    } catch {
      return reply.code(400).send({ error: 'Cannot save the uploaded file.' });
    }
  });
}
