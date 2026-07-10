import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { listReleaseVersions } from '../lib/minecraftVersions';

/**
 * v0.43.17+: exposes the full Mojang release list to the frontend so
 * the create-server / change-version dialog can render every release
 * (~200 entries as of 2026) in a scrollable dropdown, instead of the
 * hand-curated breakpoints we used to ship.
 *
 * Cached upstream 24 h via `listReleaseVersions()` — this endpoint is
 * cheap to hit repeatedly; it never leaves the panel process.
 *
 * If Mojang is unreachable AND we have no cached copy, we return an
 * empty array so the frontend can fall back to its bundled default
 * (`VERSIONS_BY_LOADER`).
 */
export async function minecraftVersionRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/minecraft-versions', async () => {
    const releases = (await listReleaseVersions()) ?? [];
    return { releases };
  });
}
