import { getDirectorySizeMb } from '../lib/diskUsage';
import {
  listAllServers,
  updateServerDiskUsed,
  type ServerRecord,
} from '../lib/servers';
import { stopContainer, getContainerState } from '../lib/docker';
import { logActivity } from '../lib/activity';
import { serverDataDir } from './provisioning';

/**
 * Background worker that measures every server's disk footprint and
 * enforces per-server quotas. Runs once a minute.
 *
 * For each server:
 *   1. `du -sb` the server's data directory
 *   2. Persist the value in `disk_used_mb` so the panel UI can show
 *      a "X MiB / Y MiB" bar without doing the measurement on every
 *      page load
 *   3. If a quota is set AND usage is above it AND the container is
 *      running → hard-stop the container, log an activity entry. The
 *      start route refuses to bring it back up until the user has
 *      raised the quota or cleared some files.
 *
 * Eventual consistency: a server can briefly exceed its quota between
 * two ticks. That's acceptable for the panel's threat model — we're
 * protecting against runaway worlds, not against malicious tenants
 * trying to fill the disk in 60 seconds.
 */

const TICK_INTERVAL_MS = 60 * 1000;

let timer: NodeJS.Timeout | null = null;

async function processServer(server: ServerRecord): Promise<void> {
  const dataDir = serverDataDir(server.id);
  const usedMb = await getDirectorySizeMb(dataDir);
  if (usedMb !== server.diskUsedMb) {
    updateServerDiskUsed(server.id, usedMb);
  }

  // Enforce the quota: if the user has set one and the server is
  // currently running while over it, stop the container.
  if (server.diskQuotaMb !== null && usedMb > server.diskQuotaMb) {
    if (server.containerId) {
      const state = await getContainerState(server.containerId);
      if (state === 'running') {
        try {
          await stopContainer(server.containerId);
          logActivity({
            serverId: server.id,
            actorId: null,
            kind: 'server.quota_exceeded',
            details: `${usedMb} MiB > ${server.diskQuotaMb} MiB quota`,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `[disk-quota] stopContainer failed for ${server.id}:`,
            err,
          );
        }
      }
    }
  }
}

async function tick(): Promise<void> {
  const servers = listAllServers();
  // Sequential is fine — `du` is fast enough and we don't want to
  // saturate the disk on a host that runs many servers.
  for (const server of servers) {
    try {
      await processServer(server);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[disk-quota] processServer failed for ${server.id}:`,
        err,
      );
    }
  }
}

/**
 * Starts the disk-quota worker. Idempotent — calling it twice is a
 * no-op (the existing timer is reused). Returns a stop function for
 * tests.
 */
export function startDiskQuotaWorker(): () => void {
  if (timer !== null) {
    return () => undefined;
  }
  // Fire one tick on startup so the panel doesn't show 0 MiB until
  // the first minute elapses.
  void tick();
  timer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  return () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}
