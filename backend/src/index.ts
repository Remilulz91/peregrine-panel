import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import { config } from './config';
import { seedTemplates } from './lib/templates';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { serverRoutes } from './routes/servers';
import { fileRoutes } from './routes/files';
import { adminRoutes } from './routes/admin';
import { backupRoutes } from './routes/backups';
import { AUTH_COOKIE } from './plugins/auth';
import { setupConsole } from './realtime/console';

/**
 * Builds and configures the Peregrine HTTP server.
 *
 * Beyond authentication, Docker server management, the live console and
 * the file manager, the server exposes per-server backups stored on the
 * dedicated disk, with a safety reserve to keep running servers alive
 * even when many backups exist.
 */
export async function buildServer() {
  const app = Fastify({
    logger: { level: config.isProduction ? 'info' : 'debug' },
  });

  // Make sure the built-in game templates exist in the database.
  seedTemplates();

  // --- Authentication building blocks: cookies + JSON Web Tokens ---
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: AUTH_COOKIE, signed: false },
  });

  // --- File uploads (used by the file manager) ---
  await app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  // --- API routes (everything is prefixed with /api) ---
  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(serverRoutes, { prefix: '/api' });
  await app.register(fileRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(backupRoutes, { prefix: '/api' });

  // --- Real-time console (Socket.IO, shares the HTTP server) ---
  setupConsole(app, app.server);

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
