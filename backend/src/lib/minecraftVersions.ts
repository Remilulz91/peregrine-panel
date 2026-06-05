import type { ServerLoader } from './servers';

/**
 * Per-loader / per-kind validation of the Minecraft version string the
 * user typed in the create-server dialog (v0.19.0+).
 *
 * Java versions are checked against Mojang's official manifest, cached
 * for 24 h so the panel doesn't hammer their CDN. The magic keywords
 * "LATEST" and "SNAPSHOT" — both understood by the itzg image — are
 * always accepted as well.
 *
 * Bedrock versions have no public manifest; we accept any
 * `X.Y.Z` / `X.Y.Z.W` shape plus LATEST.
 */

const MANIFEST_URL =
  'https://launchermeta.mojang.com/mc/game/version_manifest.json';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface ManifestEntry {
  id: string;
  type: string;
}

interface Manifest {
  versions: ManifestEntry[];
}

interface CacheValue {
  /** Set of every known Mojang version id (release + snapshot). */
  ids: Set<string>;
  /** Just the release ids — used in the error message to suggest one. */
  latestRelease: string | null;
}

let cache: { value: CacheValue; fetchedAt: number } | null = null;
let inFlight: Promise<CacheValue> | null = null;

/** Magic keywords passed straight through to the itzg entrypoint. */
const MAGIC_KEYWORDS = new Set(['LATEST', 'SNAPSHOT']);

/** Loose semver-ish shape, used both client-side and as a fallback. */
const VERSION_SHAPE = /^\d+\.\d+(\.\d+){0,2}(?:-[A-Za-z0-9_.+-]+)?$/;
const BEDROCK_SHAPE = /^\d+\.\d+\.\d+(\.\d+)?$/;

async function fetchManifest(): Promise<CacheValue> {
  const response = await fetch(MANIFEST_URL, {
    headers: { 'User-Agent': 'Peregrine-Panel/0.19' },
  });
  if (!response.ok) {
    throw new Error(`Mojang manifest HTTP ${response.status}`);
  }
  const json = (await response.json()) as Manifest;
  const ids = new Set<string>();
  let latestRelease: string | null = null;
  for (const entry of json.versions) {
    ids.add(entry.id);
    if (!latestRelease && entry.type === 'release') {
      latestRelease = entry.id;
    }
  }
  return { ids, latestRelease };
}

/**
 * Returns the cached manifest, refreshing it from Mojang if older than
 * 24 h. Concurrent callers share the same in-flight promise.
 *
 * On a fetch error we keep the old cache (if any) instead of throwing,
 * so a hiccup at Mojang doesn't take down server creation. If we have
 * no cache at all, we return null and the caller falls back to the
 * loose `VERSION_SHAPE` regex.
 */
async function getManifest(): Promise<CacheValue | null> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const value = await fetchManifest();
      cache = { value, fetchedAt: Date.now() };
      return value;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[minecraftVersions] Mojang manifest fetch failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      if (cache) return cache.value;
      throw err;
    } finally {
      inFlight = null;
    }
  })();
  try {
    return await inFlight;
  } catch {
    return null;
  }
}

/**
 * Stable error codes for `validateVersion`. The route layer sends both
 * the code (so the UI can translate) and a fallback English message
 * (so non-UI clients get a sensible reason out of the box).
 */
export type VersionErrorCode =
  | 'version.empty'
  | 'version.bedrock_shape'
  | 'version.unknown_java'
  | 'version.unknown_java_no_suggestion'
  | 'version.unverifiable';

export interface VersionErrorData {
  raw?: string;
  suggestion?: string;
}

export type VersionResult =
  | { ok: true }
  | { ok: false; code: VersionErrorCode; data: VersionErrorData; message: string };

/** Builds the English fallback message for each error code. */
function describeVersionError(
  code: VersionErrorCode,
  data: VersionErrorData,
): string {
  switch (code) {
    case 'version.empty':
      return 'Version is required.';
    case 'version.bedrock_shape':
      return `"${data.raw}" is not a valid Bedrock version. Expected something like "1.20.81.01" or "LATEST".`;
    case 'version.unknown_java':
      return `"${data.raw}" is not a known Minecraft Java version. Try "${data.suggestion}" or "LATEST".`;
    case 'version.unknown_java_no_suggestion':
      return `"${data.raw}" is not a known Minecraft Java version.`;
    case 'version.unverifiable':
      return `Could not verify the version with Mojang's manifest and "${data.raw}" does not look like a Minecraft version. Try a value like "1.21.4" or "LATEST".`;
  }
}

function fail(code: VersionErrorCode, data: VersionErrorData = {}): VersionResult {
  return { ok: false, code, data, message: describeVersionError(code, data) };
}

/**
 * Validates a Minecraft version string for the given kind / loader.
 * Resolves to `{ ok: true }` on success, or `{ ok: false, code, data,
 * message }` on failure — the route layer forwards `code` + `data` to
 * the UI so it can render a localised message, and exposes `message`
 * as an English fallback for non-UI consumers.
 *
 * For Java with a known loader (Paper / Fabric / Forge), we still
 * validate against the Mojang manifest because every loader Minecraft
 * version exists in Mojang's list too — Paper 1.21.4 follows the same
 * version id.
 */
export async function validateVersion(input: {
  kind: 'java' | 'bedrock' | string;
  loader: ServerLoader;
  version: string;
}): Promise<VersionResult> {
  const raw = input.version.trim();
  if (!raw) return fail('version.empty');
  const upper = raw.toUpperCase();

  if (MAGIC_KEYWORDS.has(upper)) return { ok: true };

  // Bedrock: we have no manifest, so only check the shape.
  if (input.kind !== 'java') {
    if (BEDROCK_SHAPE.test(raw)) return { ok: true };
    return fail('version.bedrock_shape', { raw });
  }

  // Java: hit the manifest. If the manifest is unreachable AND we
  // have no cache, fall back to a shape-only check so the user can
  // still create a server when Mojang is down.
  const manifest = await getManifest();
  if (!manifest) {
    if (VERSION_SHAPE.test(raw)) return { ok: true };
    return fail('version.unverifiable', { raw });
  }

  if (manifest.ids.has(raw)) return { ok: true };

  // Try a case-insensitive match, since users sometimes type "Latest"
  // or "1.21.4-PRE1".
  for (const id of manifest.ids) {
    if (id.toLowerCase() === raw.toLowerCase()) return { ok: true };
  }

  return manifest.latestRelease
    ? fail('version.unknown_java', { raw, suggestion: manifest.latestRelease })
    : fail('version.unknown_java_no_suggestion', { raw });
}
