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
import { iconRoutes } from './routes/icons';
import { gameSettingsRoutes } from './routes/properties';
import { playerAccessRoutes } from './routes/playerAccess';
import { AUTH_COOKIE } from './plugins/auth';
import { setupConsole } from './realtime/console';
import { startScheduleWorker } from './services/scheduleWorker';
import { startDiskQuotaWorker } from './services/diskQuotaWorker';
import { startSftpServer } from './services/sftpServer';
import { startTorList } from './lib/torExitNodes';
import { startLogRetentionWorker } from './services/logRetentionWorker';

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
    trustProxy: process.env.TRUST_PROXY !== 'false',
    // v0.34.0+: tighter limits to mitigate slow-loris / resource
    // exhaustion DoS.
    bodyLimit: 1024 * 1024,           // 1 MiB for JSON bodies (multipart has its own limit)
    keepAliveTimeout: 5_000,          // close idle keepalive sockets
    connectionTimeout: 30_000,        // abandon requests that stall this long
    requestTimeout: 30_000,
  });

  // v0.34.0+: defence-in-depth HTTP security headers on every response.
  // - HSTS forces HTTPS for 1 year (with preload, ready for the Chromium HSTS list)
  // - X-Content-Type-Options blocks MIME sniffing
  // - X-Frame-Options blocks clickjacking
  // - Referrer-Policy minimises Referer leakage cross-origin
  // - Permissions-Policy disables browser features the panel does not use
  // - CSP locks down what scripts / styles / images / sockets can be loaded
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    );
    reply.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data: blob:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self' wss: ws:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
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
  await app.register(iconRoutes, { prefix: '/api' });
  await app.register(gameSettingsRoutes, { prefix: '/api' });
  await app.register(playerAccessRoutes, { prefix: '/api' });

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
  // v0.34.0+: bootstrap the Tor exit node list (refreshes every 12 h).
  startTorList();
  startScheduleWorker();
  // The disk quota worker measures every server's data folder size
  // every minute and enforces per-server quotas.
  startDiskQuotaWorker();
  // v0.40.0+: log-retention worker. Once per day, deletes rows
  // older than LOG_RETENTION_DAYS from auth_events, audit_events,
  // and server_activity. Disabled when LOG_RETENTION_DAYS=0.
  startLogRetentionWorker();
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
