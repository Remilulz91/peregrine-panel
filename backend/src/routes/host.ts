import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { getHostMetrics, getHostResources } from '../lib/host';

/**
 * Exposes the host's CPU and RAM, plus how much is already promised to
 * existing servers and how much is still allocatable. The frontend
 * uses this on the create-server dialog and the per-server Settings
 * page so the user can never request more than the machine has left.
 *
 * v0.28.0+: also exposes a live metrics snapshot at /host/metrics for
 * the Dashboard widget. The metrics route is intentionally separate
 * from /host so existing clients keep their cheap, stateless call,
 * and the slightly more expensive metrics (200 ms CPU sampling) is
 * only paid by the Dashboard while it is open.
 *
 * Available at:
 *   GET /api/host          — allocation snapshot
 *   GET /api/host/metrics  — live CPU / RAM / disk usage
 */
export async function hostRoutes(app: FastifyInstance): Promise<void> {
  app.get('/host', { preHandler: authenticate }, async () => {
    return { resources: getHostResources() };
  });
  app.get('/host/metrics', { preHandler: authenticate }, async () => {
    return { metrics: await getHostMetrics() };
  });
}
