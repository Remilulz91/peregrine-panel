import type { FastifyInstance } from 'fastify';

/**
 * Health-check route.
 *
 * Lets you quickly verify that the backend is responding. It is used by
 * the Docker health check and can also be used for monitoring.
 *
 * Available at: GET /api/health
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'peregrine',
      version: '0.36.1',
      time: new Date().toISOString(),
    };
  });
}
