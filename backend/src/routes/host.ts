import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { getHostResources } from '../lib/host';

/**
 * Exposes the host's CPU and RAM, plus how much is already promised to
 * existing servers and how much is still allocatable. The frontend
 * uses this on the create-server dialog and the per-server Settings
 * page so the user can never request more than the machine has left.
 *
 * Available at: GET /api/host
 */
export async function hostRoutes(app: FastifyInstance): Promise<void> {
  app.get('/host', { preHandler: authenticate }, async () => {
    return { resources: getHostResources() };
  });
}
