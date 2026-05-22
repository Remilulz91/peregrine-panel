import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import {
  createServerContainer,
  pullImage,
  removeContainer,
} from '../lib/docker';
import { updateServerStatus, type ServerRecord } from '../lib/servers';

/** Returns the host directory that holds a server's game files. */
export function serverDataDir(serverId: string): string {
  return path.join(config.serversPath, serverId);
}

/**
 * Provisions a freshly created server: downloads the game image and
 * creates its Docker container.
 *
 * This runs in the background, because pulling an image can take a while.
 * It updates the server's status to OFFLINE on success, or to
 * INSTALL_FAILED if anything goes wrong (for example, Docker unreachable).
 */
export async function provisionServer(
  server: ServerRecord,
  image: string,
): Promise<void> {
  try {
    const dataDir = serverDataDir(server.id);
    fs.mkdirSync(dataDir, { recursive: true });

    await pullImage(image);
    const containerId = await createServerContainer({
      serverId: server.id,
      image,
      version: server.minecraftVersion,
      memoryMb: server.memoryMb,
      port: server.port,
      dataDir,
    });

    updateServerStatus(server.id, 'OFFLINE', containerId);
  } catch {
    updateServerStatus(server.id, 'INSTALL_FAILED');
  }
}

/** Removes a server's Docker container and deletes its game files. */
export async function deprovisionServer(server: ServerRecord): Promise<void> {
  if (server.containerId) {
    await removeContainer(server.containerId).catch(() => undefined);
  }
  fs.rmSync(serverDataDir(server.id), { recursive: true, force: true });
}
