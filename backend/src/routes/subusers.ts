import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { accessibleServer, requireOwner } from '../lib/acl';
import { findUserByEmail } from '../lib/users';
import {
  addSubuser,
  getSubuser,
  getSubuserById,
  listSubusersForServer,
  removeSubuser,
  type SubuserRecord,
  updateSubuserPermissions,
} from '../lib/subusers';
import {
  ALL_PERMISSIONS,
  sanitisePermissions,
} from '../lib/permissions';
import { logActivity } from '../lib/activity';

// A simple email check — avoids depending on JSON-schema format extensions.
const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

interface AddSubuserBody {
  email: string;
  permissions: string[];
}

interface UpdateSubuserBody {
  permissions: string[];
}

/** Shapes a subuser for the API response. */
function publicSubuser(subuser: SubuserRecord) {
  return {
    id: subuser.id,
    serverId: subuser.serverId,
    userId: subuser.userId,
    username: subuser.username,
    email: subuser.email,
    permissions: subuser.permissions,
    createdAt: subuser.createdAt,
  };
}

/**
 * Subuser management routes (mounted under /api). All require the
 * caller to be the server's owner (or an administrator). Subusers
 * themselves cannot manage other subusers — that prevents privilege
 * escalation through the share link.
 *
 *   GET    /servers/:id/subusers           - list subusers + available permissions
 *   POST   /servers/:id/subusers           - add an existing account by email
 *   PATCH  /servers/:id/subusers/:subId    - update permission set
 *   DELETE /servers/:id/subusers/:subId    - remove a subuser
 */
export async function subuserRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/servers/:id/subusers', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) return reply.code(404).send({ error: 'Server not found.' });
    if (!requireOwner(request, reply, server)) return;
    return {
      subusers: listSubusersForServer(server.id).map(publicSubuser),
      availablePermissions: [...ALL_PERMISSIONS],
    };
  });

  app.post(
    '/servers/:id/subusers',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'permissions'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 254 },
            permissions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requireOwner(request, reply, server)) return;

      const body = request.body as AddSubuserBody;
      const target = findUserByEmail(body.email.toLowerCase());
      if (!target) {
        return reply.code(404).send({
          error:
            'No account exists with this email. Ask your administrator to create it first.',
        });
      }
      // The owner cannot add themselves as a subuser — they already
      // have full access by being the owner.
      if (target.id === server.ownerId) {
        return reply.code(400).send({
          error: 'You are the owner of this server, no need to add yourself.',
        });
      }
      if (getSubuser(server.id, target.id) !== null) {
        return reply
          .code(409)
          .send({ error: 'This account already has access to this server.' });
      }

      const permissions = sanitisePermissions(body.permissions);
      const subuser = addSubuser({
        serverId: server.id,
        userId: target.id,
        permissions,
      });
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'subuser.add',
        details: target.username,
      });
      return reply.code(201).send({ subuser: publicSubuser(subuser) });
    },
  );

  app.patch(
    '/servers/:id/subusers/:subId',
    {
      schema: {
        body: {
          type: 'object',
          required: ['permissions'],
          additionalProperties: false,
          properties: {
            permissions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { id, subId } = request.params as { id: string; subId: string };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requireOwner(request, reply, server)) return;
      const existing = getSubuserById(subId, server.id);
      if (!existing) {
        return reply.code(404).send({ error: 'Subuser not found.' });
      }
      const body = request.body as UpdateSubuserBody;
      const permissions = sanitisePermissions(body.permissions);
      updateSubuserPermissions(existing.id, permissions);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'subuser.update',
        details: existing.username,
      });
      const updated = getSubuserById(existing.id, server.id);
      return {
        subuser: updated ? publicSubuser(updated) : null,
      };
    },
  );

  app.delete(
    '/servers/:id/subusers/:subId',
    async (request, reply) => {
      const { id, subId } = request.params as { id: string; subId: string };
      const server = accessibleServer(request, id);
      if (!server) return reply.code(404).send({ error: 'Server not found.' });
      if (!requireOwner(request, reply, server)) return;
      const existing = getSubuserById(subId, server.id);
      if (!existing) {
        return reply.code(404).send({ error: 'Subuser not found.' });
      }
      removeSubuser(existing.id);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'subuser.remove',
        details: existing.username,
      });
      return { ok: true };
    },
  );
}
