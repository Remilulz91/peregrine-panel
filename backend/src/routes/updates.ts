import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { getUpdateInfo } from '../services/updateCheck';

/**
 * Update-availability endpoint.
 *
 * Fetches (with a 1-hour cache) the latest published GitHub release
 * for the Peregrine repo and reports whether the running panel is on
 * the latest tag. Used by the frontend to render the "update
 * available" badge in the header.
 *
 * Auth: any logged-in user can read this. The badge is then conditionally
 * rendered admin-only on the frontend (only admins can actually apply
 * an update).
 *
 * Available at: GET /api/updates
 */
export async function updateRoutes(app: FastifyInstance): Promise<void> {
  app.get('/updates', { preHandler: authenticate }, async () => {
    const info = await getUpdateInfo();
    return info;
  });
}
