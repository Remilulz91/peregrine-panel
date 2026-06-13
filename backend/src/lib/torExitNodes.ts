import { logAuthEvent } from './authEvents';

/**
 * Tor exit node detection (v0.34.0+).
 *
 * Downloads the public Tor exit node list (~9000 IPs) from the Tor
 * Project, caches it in memory, refreshes every 12 hours. Used by
 * login + SFTP auth to reject connections originating from a Tor
 * exit node — most legitimate users do not log into a hosting panel
 * via Tor, and an enormous fraction of brute-force scans do.
 *
 * Source: https://check.torproject.org/torbulkexitlist (official,
 * updated continuously). Fetched over plain HTTPS, parsed line by
 * line. On failure we keep the previous snapshot (or empty if first
 * fetch) — a network blip should not lock anyone out.
 *
 * False-positive mitigation: an admin who legitimately routes their
 * own traffic through Tor can disable the check entirely by setting
 * `BLOCK_TOR=false` in `.env`.
 */

const TOR_LIST_URL = 'https://check.torproject.org/torbulkexitlist';
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

let exitNodes: Set<string> = new Set();
let lastFetchedAt = 0;
let refreshInFlight: Promise<void> | null = null;

async function fetchExitList(): Promise<void> {
  try {
    const response = await fetch(TOR_LIST_URL, {
      headers: { 'User-Agent': 'Peregrine-Panel/0.34' },
    });
    if (!response.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[tor] fetch failed: HTTP ${response.status}`);
      return;
    }
    const body = await response.text();
    const fresh = new Set<string>();
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
      fresh.add(trimmed);
    }
    exitNodes = fresh;
    lastFetchedAt = Date.now();
    // eslint-disable-next-line no-console
    console.log(`[tor] loaded ${fresh.size} exit nodes`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[tor] fetch error:', err);
  }
}

function getList(): Set<string> {
  const now = Date.now();
  if (now - lastFetchedAt > REFRESH_INTERVAL_MS && !refreshInFlight) {
    refreshInFlight = fetchExitList().finally(() => {
      refreshInFlight = null;
    });
  }
  return exitNodes;
}

/** Returns true if the IP is on the latest Tor exit node list. */
export function isTorExitNode(ip: string): boolean {
  if (process.env.BLOCK_TOR === 'false') return false;
  return getList().has(ip);
}

/**
 * Logs an attempt from a Tor exit node and returns true (so callers
 * can `if (handleTorAttempt(ip, 'login')) return reply.code(403)...`).
 */
export function handleTorAttempt(ip: string, kind: 'login' | 'sftp', username?: string): boolean {
  if (!isTorExitNode(ip)) return false;
  logAuthEvent({
    kind: kind === 'login' ? 'auth.tor_blocked' : 'auth.sftp_tor_blocked',
    username,
    remoteIp: ip,
  });
  return true;
}

/** Kicks off the first fetch at startup. */
export function startTorList(): void {
  void fetchExitList();
}
