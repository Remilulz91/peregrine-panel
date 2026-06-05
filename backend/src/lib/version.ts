/**
 * Single source of truth for the Peregrine version number. Bumped on
 * every release alongside backend/package.json, frontend/package.json,
 * and routes/health.ts. Re-exported from here so update-check + the
 * health route stay in sync without searching the codebase.
 */
export const PEREGRINE_VERSION = '0.22.4';

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
