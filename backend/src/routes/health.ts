import type { FastifyInstance } from 'fastify';

/**
 * Route de verification de sante.
 *
 * Permet de verifier rapidement que le backend repond. Elle est utilisee
 * par le "healthcheck" de Docker et peut servir a la surveillance.
 *
 * Accessible sur : GET /api/health
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'peregrine',
      version: '0.1.0',
      time: new Date().toISOString(),
    };
  });
}
