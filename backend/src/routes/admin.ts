import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { authenticateAdmin } from '../plugins/auth';
import {
  countAdmins,
  createUser,
  deleteUserById,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  listAllUsers,
  needsActivation,
  pendingPasswordHash,
  type UserRecord,
} from '../lib/users';
import {
  createInviteFor,
  findInviteByUserId,
  type InviteRecord,
} from '../lib/invites';
import {
  deleteServer,
  listAllServers,
  listServersByOwner,
  type ServerRecord,
} from '../lib/servers';
import { getContainerState } from '../lib/docker';
import { deprovisionServer } from '../services/provisioning';
import { disableMfa, userHasMfa } from '../lib/mfa';

interface CreateUserBody {
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';
const USERNAME_PATTERN = '^[A-Za-z0-9._-]+$';

function inviteUrlFor(token: string): string {
  return `${config.appUrl.replace(/\/+$/, '')}/invite/${token}`;
}

function publicUser(user: UserRecord, invite: InviteRecord | null) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    needsActivation: needsActivation(user),
    mfaEnabled: userHasMfa(user),
    pendingInvite: invite ? { expiresAt: invite.expiresAt } : null,
  };
}

async function effectiveStatus(server: ServerRecord): Promise<string> {
  if (server.status === 'INSTALLING' || server.status === 'INSTALL_FAILED') {
    return server.status;
  }
  if (!server.containerId) return 'OFFLINE';
  const state = await getContainerState(server.containerId);
  return state === 'running' ? 'RUNNING' : 'OFFLINE';
}

/**
 * Administrator routes (mounted under /api/admin). Every route requires
 * a logged-in user with the ADMIN role.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticateAdmin);

  app.get('/users', async () => {
    const users = listAllUsers();
    return {
      users: users.map((user) =>
        publicUser(user, findInviteByUserId(user.id)),
      ),
    };
  });

  app.post(
    '/users',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'email', 'role'],
          additionalProperties: false,
          properties: {
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 32,
              pattern: USERNAME_PATTERN,
            },
            email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 254 },
            role: { type: 'string', enum: ['USER', 'ADMIN'] },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as CreateUserBody;
      const email = body.email.toLowerCase();

      if (findUserByUsername(body.username)) {
        return reply
          .code(409)
          .send({ error: 'This username is already taken.' });
      }
      if (findUserByEmail(email)) {
        return reply
          .code(409)
          .send({ error: 'This email is already in use.' });
      }

      const user = createUser({
        username: body.username,
        email,
        passwordHash: pendingPasswordHash(randomUUID()),
        role: body.role,
      });
      const invite = createInviteFor(user.id);

      return reply.code(201).send({
        user: publicUser(user, invite),
        inviteUrl: inviteUrlFor(invite.token),
      });
    },
  );

  app.post('/users/:id/invite', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = findUserById(id);
    if (!user) {
      return reply.code(404).send({ error: 'User not found.' });
    }
    if (!needsActivation(user)) {
      return reply.code(409).send({
        error:
          'This account is already active — no invitation can be regenerated.',
      });
    }
    const invite = createInviteFor(user.id);
    return {
      user: publicUser(user, invite),
      inviteUrl: inviteUrlFor(invite.token),
    };
  });

  // Reset a user's MFA — useful when they have lost both their phone
  // and their recovery codes. The user can re-enable MFA from their
  // Account page after logging in again.
  app.post('/users/:id/mfa-reset', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = findUserById(id);
    if (!user) {
      return reply.code(404).send({ error: 'User not found.' });
    }
    if (!userHasMfa(user)) {
      return reply.code(409).send({ error: 'MFA is not enabled on this account.' });
    }
    disableMfa(user.id);
    return {
      user: publicUser(user, findInviteByUserId(user.id)),
    };
  });

  app.delete('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = findUserById(id);
    if (!user) {
      return reply.code(404).send({ error: 'User not found.' });
    }
    if (user.id === request.user.sub) {
      return reply
        .code(400)
        .send({ error: 'You cannot delete your own account.' });
    }
    if (user.role === 'ADMIN' && countAdmins() <= 1) {
      return reply
        .code(400)
        .send({ error: 'Cannot delete the last administrator.' });
    }

    const servers = listServersByOwner(user.id);
    for (const server of servers) {
      await deprovisionServer(server);
      deleteServer(server.id);
    }
    deleteUserById(user.id);

    return { ok: true };
  });

  app.get('/servers', async () => {
    const servers = listAllServers();
    const users = new Map(listAllUsers().map((u) => [u.id, u]));
    const result = await Promise.all(
      servers.map(async (server) => {
        const owner = users.get(server.ownerId);
        return {
          id: server.id,
          name: server.name,
          status: await effectiveStatus(server),
          templateId: server.templateId,
          minecraftVersion: server.minecraftVersion,
          description: server.description,
          memoryMb: server.memoryMb,
          cpuLimit: server.cpuLimit,
          port: server.port,
          createdAt: server.createdAt,
          isOwner: false,
          ownerUsername: owner?.username ?? '?',
          owner: owner
            ? { id: owner.id, username: owner.username }
            : { id: server.ownerId, username: '?' },
        };
      }),
    );
    return { servers: result };
  });
}
