import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import {
  accessibleServer,
  requirePermission,
} from '../lib/acl';
import { getTemplate } from '../lib/templates';
import { PERMISSION } from '../lib/permissions';
import {
  readGameSettings,
  validateGameSettings,
  writeGameSettings,
} from '../lib/properties';
import { logActivity } from '../lib/activity';

/**
 * Game settings routes (v0.18.0+).
 *
 *   GET /api/servers/:id/game-settings — current values from
 *     `server.properties` (or defaults if the file does not exist).
 *   PUT /api/servers/:id/game-settings — overwrite the managed keys
 *     while preserving every other entry in the file. The user
 *     still has to restart the server for the changes to take
 *     effect — this is documented in the UI.
 *
 * Java only. Bedrock servers are recognised but the routes return
 * 501 with a clear message, instead of silently writing into a file
 * with a different schema.
 */
export async function gameSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/servers/:id/game-settings',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) {
        return reply.code(404).send({ error: 'Server not found.' });
      }
      const template = getTemplate(server.templateId);
      if (!template || template.kind !== 'java') {
        return reply.code(501).send({
          error: 'Game settings are only available for Minecraft Java servers.',
        });
      }
      return readGameSettings(server.id);
    },
  );

  app.put(
    '/servers/:id/game-settings',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) {
        return reply.code(404).send({ error: 'Server not found.' });
      }
      const template = getTemplate(server.templateId);
      if (!template || template.kind !== 'java') {
        return reply.code(501).send({
          error: 'Game settings are only available for Minecraft Java servers.',
        });
      }
      if (
        !requirePermission(request, reply, server, PERMISSION.SETTINGS_RENAME)
      ) {
        return;
      }

      let settings;
      try {
        settings = validateGameSettings(request.body);
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : 'Invalid payload.' });
      }

      writeGameSettings(server.id, settings);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.game_settings_updated',
        details: `${settings.gamemode}/${settings.difficulty}, ${settings.maxPlayers} max, pvp=${settings.pvp}`,
      });
      return { settings };
    },
  );
}
