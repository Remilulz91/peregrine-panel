import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { config } from '../config';
import { findUserById } from '../lib/users';

/**
 * Returns SFTP connection details for the currently authenticated user.
 *
 * The host is intentionally left blank: the frontend already knows where
 * the panel lives (it is talking to it!), so it derives the SFTP host from
 * `window.location.hostname`. We only return the port, the username
 * prefix the client must use, and whether MFA is enabled on the account
 * (so the UI can surface the "SFTP authenticates with your panel
 * password" warning).
 *
 * Available at: GET /api/sftp
 */
export async function sftpRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sftp', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user.sub;
    const user = findUserById(userId);
    if (!user) {
      await reply.code(401).send({ error: 'Unauthorized' });
      return;
    }

    return {
      enabled: config.sftpPort > 0,
      port: config.sftpPort,
      username: user.username,
      mfaEnabled: user.mfaSecret !== null,
    };
  });
}
