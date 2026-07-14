import type { FastifyInstance } from 'fastify';
import { PEREGRINE_VERSION } from '../lib/version';

/**
 * Health-check route.
 *
 * Lets you quickly verify that the backend is responding. It is used by
 * the Docker health check and can also be used for monitoring.
 *
 * v0.44.1+: version string is imported from lib/version (which itself
 * reads backend/package.json at boot), so a release bump only touches
 * package.json - not this file too.
 *
 * Available at: GET /api/health
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'peregrine',
      version: PEREGRINE_VERSION,
      time: new Date().toISOString(),
    };
  });
}
