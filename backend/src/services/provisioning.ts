import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import {
  createServerContainer,
  pullImage,
  removeContainer,
  startContainer,
} from '../lib/docker';
import { updateServerStatus, type ServerRecord } from '../lib/servers';
import type { GameTemplate } from '../lib/templates';
import { logActivity } from '../lib/activity';

/** Returns the host directory that holds a server's game files. */
export function serverDataDir(serverId: string): string {
  return path.join(config.serversPath, serverId);
}

/** Sleeps for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Returns a human-readable error message regardless of the error type. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Pulls the Docker image, retrying a few times on transient failures.
 * The most common cause of "INSTALL_FAILED" was a one-off network hiccup
 * during the pull — retrying with backoff makes provisioning much more
 * reliable on flaky connections.
 */
async function pullImageWithRetry(
  image: string,
  attempts = 3,
): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await pullImage(image);
      return;
    } catch (err) {
      lastError = err;
      // eslint-disable-next-line no-console
      console.warn(
        `[provisioning] pullImage(${image}) failed on attempt ${i + 1}/${attempts}: ${describeError(err)}`,
      );
      if (i < attempts - 1) {
        // Exponential-ish backoff: 2 s, 4 s.
        await sleep(2000 * (i + 1));
      }
    }
  }
  throw lastError;
}

/**
 * Provisions a freshly created server: downloads the game image and
 * creates its Docker container (with CPU and RAM limits applied).
 *
 * This runs in the background, because pulling an image can take a while.
 * It updates the server's status to OFFLINE on success, or to
 * INSTALL_FAILED if anything goes wrong (for example, Docker unreachable
 * or the chosen loader / version combination is not supported).
 *
 * The image pull is retried up to 3 times with backoff, because the
 * single biggest cause of "creation failed" was transient network
 * errors during the pull from Docker Hub. Any failure that still gets
 * through is logged to stderr and recorded as an activity event so it
 * can be diagnosed instead of vanishing silently.
 */
export async function provisionServer(
  server: ServerRecord,
  template: GameTemplate,
  options: { autostart?: boolean } = {},
): Promise<void> {
  let stage: 'mkdir' | 'pull' | 'create' = 'mkdir';
  let containerId: string | null = null;
  try {
    const dataDir = serverDataDir(server.id);
    fs.mkdirSync(dataDir, { recursive: true });

    stage = 'pull';
    await pullImageWithRetry(template.dockerImage);

    stage = 'create';
    containerId = await createServerContainer({
      serverId: server.id,
      image: template.dockerImage,
      kind: template.kind,
      loader: server.loader,
      version: server.minecraftVersion,
      memoryMb: server.memoryMb,
      cpuLimit: server.cpuLimit,
      internalPort: template.internalPort,
      portProtocol: template.portProtocol,
      port: server.port,
      dataDir,
    });

    updateServerStatus(server.id, 'OFFLINE', containerId);
  } catch (err) {
    const reason = describeError(err);
    // eslint-disable-next-line no-console
    console.error(
      `[provisioning] server ${server.id} (${server.name}) failed at stage "${stage}": ${reason}`,
    );
    updateServerStatus(server.id, 'INSTALL_FAILED');
    logActivity({
      serverId: server.id,
      actorId: null,
      kind: 'server.install_failed',
      details: `${stage}: ${reason}`.slice(0, 500),
    });
    return;
  }

  // Optional auto-start (v0.14.0+). The install itself is done at this
  // point, so a failure here doesn't roll the server back to
  // INSTALL_FAILED — the user can simply hit Start manually. We log
  // both success and failure to the activity feed so the boot trace
  // is visible.
  if (options.autostart && containerId) {
    try {
      await startContainer(containerId);
      logActivity({
        serverId: server.id,
        actorId: null,
        kind: 'server.start',
        details: 'auto-start after install',
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[provisioning] auto-start failed for ${server.id}: ${describeError(err)}`,
      );
      logActivity({
        serverId: server.id,
        actorId: null,
        kind: 'server.autostart_failed',
        details: describeError(err).slice(0, 500),
      });
    }
  }
}

/** Removes a server's Docker container and deletes its game files. */
export async function deprovisionServer(server: ServerRecord): Promise<void> {
  if (server.containerId) {
    await removeContainer(server.containerId).catch(() => undefined);
  }
  fs.rmSync(serverDataDir(server.id), { recursive: true, force: true });
}
