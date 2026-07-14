import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Single source of truth for the Peregrine version number.
 *
 * v0.44.1+: read straight from backend/package.json at process
 * start instead of a hardcoded constant. Before this change, THREE
 * places had to be bumped in lockstep at every release
 * (backend/package.json, backend/src/lib/version.ts, and
 * backend/src/routes/health.ts) - if any got forgotten, the
 * update-check badge would either show a false "update available"
 * (this file lagging) or the /api/health probe would report a stale
 * version (health.ts lagging). Reading from package.json here plus
 * having health.ts import PEREGRINE_VERSION from this module means
 * a release bump only ever touches backend/package.json and
 * frontend/package.json.
 *
 * __dirname at runtime resolves to:
 *  - dev (tsx watch): <repo>/backend/src/lib -> ../../package.json = backend/package.json OK
 *  - prod (node dist): <repo>/backend/dist/lib -> ../../package.json = backend/package.json OK
 */
const pkgJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf-8'),
) as { version: string };

export const PEREGRINE_VERSION: string = pkgJson.version;

/**
 * Compares two semantic version strings (possibly prefixed with "v")
 * and returns true when `latest` is strictly newer than `current`.
 * Handles 2-part, 3-part, and pre-release-free tags. Anything weird
 * just falls back to a "not newer" answer rather than throwing.
 */
export function isVersionNewer(latest: string, current: string): boolean {
  const strip = (s: string): number[] =>
    s
      .replace(/^v/i, '')
      .split('.')
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const a = strip(latest);
  const b = strip(current);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const aPart = a[i] ?? 0;
    const bPart = b[i] ?? 0;
    if (aPart > bPart) return true;
    if (aPart < bPart) return false;
  }
  return false;
}
