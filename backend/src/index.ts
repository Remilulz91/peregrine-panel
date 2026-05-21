import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { healthRoutes } from './routes/health';

/**
 * Builds and configures the Peregrine HTTP server.
 *
 * Phase 0: the server exposes a health-check route and serves the compiled
 * React interface. The database, authentication and Docker control are
 * added in later phases.
 */
export async function buildServer() {
  const app = Fastify({
    logger: { level: config.isProduction ? 'info' : 'debug' },
  });

  // --- API routes (everything is prefixed with /api) ---
  await app.register(healthRoutes, { prefix: '/api' });

  // --- Web interface (static files) ---
  // In production, the compiled React interface sits next to the backend.
  const frontendDir = path.resolve(__dirname, '../../frontend/dist');
  const indexHtml = path.join(frontendDir, 'index.html');

  if (fs.existsSync(indexHtml)) {
    await app.register(fastifyStatic, { root: frontendDir });

    // Single-page-app fallback: any non-API route returns index.html
    // so that React's routing can handle it.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        reply.code(404).send({ error: 'Not Found' });
        return;
      }
      return reply.sendFile('index.html');
    });
  } else {
    // The interface has not been built yet (typically in development,
    // where the frontend runs on its own server via "npm run dev:frontend").
    app.get('/', async () => ({
      name: 'Peregrine',
      message:
        'Backend is running. The interface is not built: ' +
        'start the frontend with "npm run dev:frontend".',
    }));
  }

  return app;
}

/** Entry point: starts the HTTP server. */
async function start(): Promise<void> {
  const app = await buildServer();
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Peregrine started - ${config.appUrl}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
