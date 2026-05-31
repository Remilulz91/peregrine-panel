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
import { subuserRoutes } from './routes/subusers';
import { scheduleRoutes } from './routes/schedules';
import { sftpRoutes } from './routes/sftp';
import { hostRoutes } from './routes/host';
import { updateRoutes } from './routes/updates';
import { playerRoutes } from './routes/players';
import { AUTH_COOKIE } from './plugins/auth';
import { setupConsole } from './realtime/console';
import { startScheduleWorker } from './services/scheduleWorker';
import { startDiskQuotaWorker } from './services/diskQuotaWorker';
import { startSftpServer } from './services/sftpServer';

/**
 * Builds and configures the Peregrine HTTP server.
 *
 * Beyond authentication, Docker management, the live console, the file
 * manager, backups and subuser ACLs, the server now runs a background
 * worker that fires recurring tasks (currently: scheduled backups) and
 * an in-process SFTP server for direct file access.
 */
export async function buildServer() {
  const app = Fastify({
    logger: { level: config.isProduction ? 'info' : 'debug' },
  });

  // Make sure the built-in game templates exist in the database.
  seedTemplates();

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: AUTH_COOKIE, signed: false },
  });

  await app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(serverRoutes, { prefix: '/api' });
  await app.register(fileRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(backupRoutes, { prefix: '/api' });
  await app.register(subuserRoutes, { prefix: '/api' });
  await app.register(scheduleRoutes, { prefix: '/api' });
  await app.register(sftpRoutes, { prefix: '/api' });
  await app.register(hostRoutes, { prefix: '/api' });
  await app.register(updateRoutes, { prefix: '/api' });
  await app.register(playerRoutes, { prefix: '/api' });

  setupConsole(app, app.server);

  const frontendDir = path.resolve(__dirname, '../../frontend/dist');
  const indexHtml = path.join(frontendDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    await app.register(fastifyStatic, { root: frontendDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        reply.code(404).send({ error: 'Not Found' });
        return;
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({
      name: 'Peregrine',
      message:
        'Backend is running. The interface is not built: ' +
        'start the frontend with "npm run dev:frontend".',
    }));
  }

  return app;
}

/** Entry point: starts the HTTP server and the background workers. */
async function start(): Promise<void> {
  const app = await buildServer();
  // The schedule worker runs alongside the HTTP server. It's started
  // unconditionally because it does nothing until a schedule is due.
  startScheduleWorker();
  // The disk quota worker measures every server's data folder size
  // every minute and enforces per-server quotas.
  startDiskQuotaWorker();
  // The SFTP server runs in-process on its own TCP port. SFTP_PORT=0
  // disables it (handy for development environments where the port is
  // already taken).
  if (config.sftpPort > 0) {
    try {
      startSftpServer();
      app.log.info(`Peregrine SFTP server listening on port ${config.sftpPort}`);
    } catch (err) {
      app.log.error({ err }, 'Failed to start the SFTP server');
    }
  }
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Peregrine started - ${config.appUrl}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
