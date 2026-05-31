import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import {
  accessibleServer,
  requirePermission,
} from '../lib/acl';
import { PERMISSION } from '../lib/permissions';
import {
  hasIcon,
  iconPath,
  isPng,
  iconUpdatedAt,
  removeIcon,
  writeIcon,
} from '../lib/icons';
import { logActivity } from '../lib/activity';

/** Maximum icon size, in bytes. 256 KiB is plenty for a 128×128 PNG. */
const MAX_ICON_BYTES = 256 * 1024;

/**
 * Per-server icon routes (v0.17.0+).
 *
 *   GET    /api/servers/:id/icon   — returns the PNG bytes (or 404)
 *   POST   /api/servers/:id/icon   — multipart upload (PNG, max 256 KiB)
 *   DELETE /api/servers/:id/icon   — removes the icon
 *
 * Upload and delete require the `settings.rename` permission (same
 * gate as renaming or editing the description — purely cosmetic
 * owner-managed metadata). Reads are open to anyone with server
 * access so the icon shows up in shared dashboards.
 */
export async function iconRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/servers/:id/icon',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) {
        return reply.code(404).send({ error: 'Server not found.' });
      }
      if (!hasIcon(server.id)) {
        return reply.code(404).send({ error: 'No icon set.' });
      }
      reply.type('image/png');
      // Browser caches aggressively — let it, the URL has ?v=<mtime>
      // for cache busting after a re-upload.
      reply.header('Cache-Control', 'public, max-age=86400');
      return reply.send(fs.createReadStream(iconPath(server.id)));
    },
  );

  app.post(
    '/servers/:id/icon',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) {
        return reply.code(404).send({ error: 'Server not found.' });
      }
      if (
        !requirePermission(request, reply, server, PERMISSION.SETTINGS_RENAME)
      ) {
        return;
      }

      const uploaded = await request.file();
      if (!uploaded) {
        return reply.code(400).send({ error: 'No file was provided.' });
      }
      const data = await uploaded.toBuffer();
      if (data.length === 0) {
        return reply.code(400).send({ error: 'The uploaded file is empty.' });
      }
      if (data.length > MAX_ICON_BYTES) {
        return reply
          .code(413)
          .send({ error: `Icon must be 256 KiB or smaller.` });
      }
      if (!isPng(data)) {
        return reply
          .code(400)
          .send({ error: 'Only PNG images are accepted.' });
      }

      writeIcon(server.id, data);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.icon_set',
        details: `${data.length} bytes`,
      });
      return { ok: true, iconUpdatedAt: iconUpdatedAt(server.id) };
    },
  );

  app.delete(
    '/servers/:id/icon',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) {
        return reply.code(404).send({ error: 'Server not found.' });
      }
      if (
        !requirePermission(request, reply, server, PERMISSION.SETTINGS_RENAME)
      ) {
        return;
      }
      removeIcon(server.id);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.icon_cleared',
      });
      return { ok: true };
    },
  );
}
