import type { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  countUsers,
  createUser,
  findUserByEmail,
  findUserById,
  type UserRecord,
} from '../lib/users';
import { authenticate, setAuthCookie, clearAuthCookie } from '../plugins/auth';

interface SetupBody {
  username: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

/** Shapes a user for the API response — never exposes the password hash. */
function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// A simple email check — avoids depending on JSON-schema format extensions.
const EMAIL_PATTERN = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';

/**
 * Authentication routes (mounted under /api/auth):
 *   GET  /setup-required  - is the first-run setup still needed?
 *   POST /setup           - create the first account (the administrator)
 *   POST /login           - log in with email + password
 *   POST /logout          - log out
 *   GET  /me              - the currently logged-in user (protected)
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/setup-required', async () => {
    return { setupRequired: countUsers() === 0 };
  });

  app.post(
    '/setup',
    {
      schema: {
        body: {
          type: 'object',
          required: ['username', 'email', 'password'],
          additionalProperties: false,
          properties: {
            username: { type: 'string', minLength: 3, maxLength: 32 },
            email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 254 },
            password: { type: 'string', minLength: 8, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      // The setup route only works while no account exists yet.
      if (countUsers() > 0) {
        return reply
          .code(409)
          .send({ error: 'Setup has already been completed.' });
      }
      const { username, email, password } = request.body as SetupBody;
      const user = createUser({
        username,
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
      });
      setAuthCookie(app, reply, user);
      return { user: publicUser(user) };
    },
  );

  app.post(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', pattern: EMAIL_PATTERN, maxLength: 254 },
            password: { type: 'string', minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body as LoginBody;
      const user = findUserByEmail(email.toLowerCase());
      if (!user || !(await verifyPassword(user.passwordHash, password))) {
        return reply.code(401).send({ error: 'Invalid email or password.' });
      }
      setAuthCookie(app, reply, user);
      return { user: publicUser(user) };
    },
  );

  app.post('/logout', async (_request, reply) => {
    clearAuthCookie(reply);
    return { ok: true };
  });

  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = findUserById(request.user.sub);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    return { user: publicUser(user) };
  });
}
