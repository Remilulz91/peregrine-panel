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

interface CreateUserBody {
  username: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

// A simple email check — avoids depending on JSON-schema format extensions.
const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';
// Usernames stay in the printable ASCII range that is safe for logins.
const USERNAME_PATTERN = '^[A-Za-z0-9._-]+$';

/** Builds the URL an invitee should open in their browser. */
function inviteUrlFor(token: string): string {
  return `${config.appUrl.replace(/\/+$/, '')}/invite/${token}`;
}

/** Shapes a user for the API response — never exposes the password hash. */
function publicUser(user: UserRecord, invite: InviteRecord | null) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    // True while the account waits for its invitation to be accepted; the
    // admin uses this to know whether the "regenerate invite" action even
    // makes sense (it is not allowed on activated accounts).
    needsActivation: needsActivation(user),
    // The presence of an invitation tells the admin that a still-valid
    // link exists in the database. Expired invites are cleaned up on
    // lookup, so this can be null even when needsActivation is true.
    pendingInvite: invite ? { expiresAt: invite.expiresAt } : null,
  };
}

/** Computes the status to show for a server (database + Docker probe). */
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
 * Administrator routes (mounted under /api/admin). Every route requires
 * a logged-in user with the ADMIN role.
 *   GET    /users                - list every account
 *   POST   /users                - create an invited account
 *   POST   /users/:id/invite     - regenerate the invitation link
 *   DELETE /users/:id            - delete an account and its servers
 *   GET    /servers              - list every server, with owner info
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

      // The placeholder is not a valid Argon2 hash, so verifyPassword
      // returns false: nobody can log in until the invitation is accepted
      // and a real password is set.
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
    // Regenerating an invitation only makes sense for accounts that have
    // not yet been activated. Allowing it on an active account would let
    // an admin silently reset another user's password.
    if (!needsActivation(user)) {
      return reply.code(409).send({
        error: 'This account is already active — no invitation can be regenerated.',
      });
    }
    const invite = createInviteFor(user.id);
    return {
      user: publicUser(user, invite),
      inviteUrl: inviteUrlFor(invite.token),
    };
  });

  app.delete('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = findUserById(id);
    if (!user) {
      return reply.code(404).send({ error: 'User not found.' });
    }
    // Safety: an admin cannot delete themselves, and the last remaining
    // administrator cannot be removed (the panel would become unusable).
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

    // Tear down every Docker container this user owned, then drop the
    // server rows, then the user (which cascades to the invite row).
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
          memoryMb: server.memoryMb,
          cpuLimit: server.cpuLimit,
          port: server.port,
          createdAt: server.createdAt,
          owner: owner
            ? { id: owner.id, username: owner.username }
            : { id: server.ownerId, username: '?' },
        };
      }),
    );
    return { servers: result };
  });
}
