import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config';
import { healthRoutes } from './routes/health';

/**
 * Construit et configure le serveur HTTP de Peregrine.
 *
 * Phase 0 : le serveur expose une route de verification de sante et sert
 * l'interface React compilee. La base de donnees, l'authentification et le
 * pilotage de Docker seront ajoutes dans les phases suivantes.
 */
export async function buildServer() {
  const app = Fastify({
    logger: { level: config.isProduction ? 'info' : 'debug' },
  });

  // --- Routes de l'API (tout est prefixe par /api) ---
  await app.register(healthRoutes, { prefix: '/api' });

  // --- Interface web (fichiers statiques) ---
  // En production, l'interface React compilee se trouve a cote du backend.
  const frontendDir = path.resolve(__dirname, '../../frontend/dist');
  const indexHtml = path.join(frontendDir, 'index.html');

  if (fs.existsSync(indexHtml)) {
    await app.register(fastifyStatic, { root: frontendDir });

    // Repli "single-page app" : toute route non-API renvoie index.html
    // afin que le routage cote React puisse la prendre en charge.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        reply.code(404).send({ error: 'Not Found' });
        return;
      }
      return reply.sendFile('index.html');
    });
  } else {
    // L'interface n'a pas encore ete compilee (typiquement en developpement,
    // ou le frontend tourne sur son propre serveur via "npm run dev:frontend").
    app.get('/', async () => ({
      name: 'Peregrine',
      message:
        "Backend en cours d'execution. L'interface n'est pas compilee : " +
        'lancez le frontend avec "npm run dev:frontend".',
    }));
  }

  return app;
}

/** Point d'entree : demarre le serveur HTTP. */
async function start(): Promise<void> {
  const app = await buildServer();
  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(`Peregrine demarre - ${config.appUrl}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
