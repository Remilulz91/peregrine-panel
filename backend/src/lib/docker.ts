import Docker from 'dockerode';
import { config } from '../config';

// Connection to the local Docker daemon, used to manage game-server
// containers. Talking to this socket is equivalent to root on the host,
// so it must never be exposed outside the machine.
const docker = new Docker({ socketPath: config.dockerSocket });

/** Pulls a Docker image and waits until the download is complete. */
export async function pullImage(image: string): Promise<void> {
  const stream = await docker.pull(image);
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}

interface CreateContainerInput {
  serverId: string;
  image: string;
  version: string;
  memoryMb: number;
  /** Host port mapped to the game's port inside the container. */
  port: number;
  /** Host directory bind-mounted as the server's /data folder. */
  dataDir: string;
}

/**
 * Creates (without starting) the Docker container for a game server,
 * and returns its container id.
 */
export async function createServerContainer(
  input: CreateContainerInput,
): Promise<string> {
  const container = await docker.createContainer({
    name: `peregrine-${input.serverId}`,
    Image: input.image,
    // Environment variables understood by the itzg/minecraft-server image.
    Env: [
      'EULA=TRUE',
      `VERSION=${input.version}`,
      `MEMORY=${input.memoryMb}M`,
    ],
    ExposedPorts: { '25565/tcp': {} },
    HostConfig: {
      Binds: [`${input.dataDir}:/data`],
      PortBindings: {
        '25565/tcp': [{ HostPort: String(input.port) }],
      },
      RestartPolicy: { Name: 'unless-stopped' },
    },
  });
  return container.id;
}

/** Removes a container, stopping it first if it is still running. */
export async function removeContainer(containerId: string): Promise<void> {
  await docker.getContainer(containerId).remove({ force: true });
}
