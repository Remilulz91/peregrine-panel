import { isVersionNewer, PEREGRINE_VERSION } from '../lib/version';

/**
 * Snapshot returned to the frontend so it can decide whether to show
 * the "update available" badge. `latestVersion` and friends are null
 * when the GitHub check has not yet succeeded (e.g. on first boot,
 * rate-limited, or unreachable). The frontend treats null as
 * "no badge" — fail-quiet by design.
 */
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  upToDate: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
}

/** GitHub repo we look at. Hard-coded — this is THE repo. */
const REPO = 'Remilulz91/peregrine-panel';

/** GitHub Releases API endpoint for the latest published release. */
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** How long a successful check is reused before we hit GitHub again. */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** How long we wait on GitHub before giving up (network down, etc.). */
const FETCH_TIMEOUT_MS = 5000;

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
}

let cache: { value: UpdateInfo; fetchedAt: number } | null = null;
let inFlight: Promise<UpdateInfo> | null = null;

/**
 * Fetches the latest published release from GitHub, with a small
 * timeout. Returns null when anything goes wrong — never throws.
 */
async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(RELEASES_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `peregrine-panel/${PEREGRINE_VERSION}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as GitHubRelease;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Builds the empty (cache miss / network down) snapshot. */
function unknownSnapshot(): UpdateInfo {
  return {
    currentVersion: PEREGRINE_VERSION,
    latestVersion: null,
    upToDate: true,
    releaseUrl: null,
    publishedAt: null,
  };
}

/**
 * Returns the current update snapshot. Cached for 1 hour. Multiple
 * concurrent callers during a refresh share the same fetch promise,
 * so we never hammer GitHub with parallel requests.
 */
export async function getUpdateInfo(): Promise<UpdateInfo> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async (): Promise<UpdateInfo> => {
    const release = await fetchLatestRelease();
    if (!release || !release.tag_name) {
      // On failure: keep serving the previous cache if any, otherwise
      // return the empty snapshot so the frontend just hides the badge.
      const value = cache?.value ?? unknownSnapshot();
      // We DO update the timestamp so failures don't refetch on every
      // call — wait for the TTL like a success would.
      cache = { value, fetchedAt: now };
      return value;
    }

    const latestVersion = release.tag_name;
    const upToDate = !isVersionNewer(latestVersion, PEREGRINE_VERSION);
    const value: UpdateInfo = {
      currentVersion: PEREGRINE_VERSION,
      latestVersion,
      upToDate,
      releaseUrl: release.html_url ?? null,
      publishedAt: release.published_at ?? null,
    };
    cache = { value, fetchedAt: now };
    return value;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
