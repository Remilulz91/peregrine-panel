import { PassThrough, type Readable } from 'node:stream';
import Docker from 'dockerode';
import { config } from '../config';
import type { ServerLoader } from './servers';

// Connection to the local Docker daemon, used to manage game-server
// containers. Talking to this socket is equivalent to root on the host,
// so it must never be exposed outside the machine.
const docker = new Docker({ socketPath: config.dockerSocket });

/** The runtime state of a container, as seen by Docker. */
export type ContainerState = 'running' | 'stopped' | 'missing';

// Minecraft colour codes: the section sign (char 0xA7) followed by one char.
const MINECRAFT_COLOUR = new RegExp(String.fromCharCode(0xa7) + '.', 'g');
// ANSI escape sequences: ESC (char 0x1B) + "[" + parameters + "m".
const ANSI_ESCAPE = new RegExp(String.fromCharCode(0x1b) + '\\[[0-9;]*m', 'g');

/**
 * Cleans console text for display by removing Minecraft colour codes, ANSI
 * escape sequences and non-printable control characters. Tab, newline and
 * carriage return are kept.
 */
function cleanConsoleText(text: string): string {
  const withoutCodes = text
    .replace(MINECRAFT_COLOUR, '')
    .replace(ANSI_ESCAPE, '');

  let result = '';
  for (const character of withoutCodes) {
    const code = character.codePointAt(0) ?? 0;
    const isAllowed =
      code === 0x09 || // tab
      code === 0x0a || // newline
      code === 0x0d || // carriage return
      (code >= 0x20 && code !== 0x7f); // printable characters
    if (isAllowed) {
      result += character;
    }
  }
  return result;
}

/** Returns true for a Docker error meaning "already in that state". */
function isAlreadyInState(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err &&
    (err as { statusCode: number }).statusCode === 304
  );
}

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
  /** "java" or "bedrock" — drives the environment variables. */
  kind: string;
  /** "vanilla", "paper", "fabric", "forge" — passed to itzg as TYPE. */
  loader: ServerLoader;
  version: string;
  /** RAM limit, in MB. */
  memoryMb: number;
  /** CPU limit, in cores (e.g. 1.5). */
  cpuLimit: number;
  /** Port the game listens on inside the container. */
  internalPort: number;
  /** "tcp" or "udp". */
  portProtocol: string;
  /** Host port mapped to the game's port. */
  port: number;
  /** Host directory bind-mounted as the server's /data folder. */
  dataDir: string;
}

/** Maps Peregrine's loader names to the values itzg's image expects. */
function itzgTypeFor(loader: ServerLoader): string {
  switch (loader) {
    case 'paper':
      return 'PAPER';
    case 'fabric':
      return 'FABRIC';
    case 'forge':
      return 'FORGE';
    case 'vanilla':
    default:
      return 'VANILLA';
  }
}

/**
 * Creates (without starting) the Docker container for a game server, with
 * CPU and RAM limits applied, and returns its container id.
 */
export async function createServerContainer(
  input: CreateContainerInput,
): Promise<string> {
  const portKey = `${input.internalPort}/${input.portProtocol}`;

  // Environment variables understood by the itzg Minecraft images.
  const env = ['EULA=TRUE', `VERSION=${input.version}`];
  if (input.kind === 'java') {
    // The TYPE env tells itzg which server flavour to download and run.
    // Bedrock has no loader concept, so we only set TYPE for Java.
    env.push(`TYPE=${itzgTypeFor(input.loader)}`);
    // Leave headroom below the container limit for the JVM's non-heap memory.
    const heapMb = Math.max(input.memoryMb - 512, 512);
    env.push(`MEMORY=${heapMb}M`);
  }

  const container = await docker.createContainer({
    name: `peregrine-${input.serverId}`,
    Image: input.image,
    Env: env,
    ExposedPorts: { [portKey]: {} },
    HostConfig: {
      Binds: [`${input.dataDir}:/data`],
      PortBindings: {
        [portKey]: [{ HostPort: String(input.port) }],
      },
      // Resource limits: hard RAM cap and CPU share.
      Memory: input.memoryMb * 1024 * 1024,
      NanoCpus: Math.round(input.cpuLimit * 1e9),
      RestartPolicy: { Name: 'unless-stopped' },
    },
  });
  return container.id;
}

/** Removes a container, stopping it first if it is still running. */
export async function removeContainer(containerId: string): Promise<void> {
  await docker.getContainer(containerId).remove({ force: true });
}

/**
 * Applies new CPU / RAM limits to an existing container. Docker accepts
 * resource updates on stopped containers without restart; the new
 * limits take effect on the next start. If the container is gone (the
 * user deleted it out-of-band), the call returns silently — the panel
 * is the source of truth for the new limits anyway.
 */
export async function updateContainerResources(
  containerId: string,
  memoryMb: number,
  cpuLimit: number,
): Promise<void> {
  try {
    await docker.getContainer(containerId).update({
      Memory: memoryMb * 1024 * 1024,
      // Docker also enforces a sane swap when Memory is set; matching
      // it avoids the "swap is greater than memory" warning some
      // engines emit on update.
      MemorySwap: memoryMb * 1024 * 1024,
      NanoCpus: Math.round(cpuLimit * 1e9),
    });
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      (err as { statusCode: number }).statusCode === 404
    ) {
      return;
    }
    throw err;
  }
}

/** Starts a container. Does nothing if it is already running. */
export async function startContainer(containerId: string): Promise<void> {
  try {
    await docker.getContainer(containerId).start();
  } catch (err) {
    if (!isAlreadyInState(err)) {
      throw err;
    }
  }
}

/** Stops a container. Does nothing if it is already stopped. */
export async function stopContainer(containerId: string): Promise<void> {
  try {
    await docker.getContainer(containerId).stop();
  } catch (err) {
    if (!isAlreadyInState(err)) {
      throw err;
    }
  }
}

/** Restarts a container. */
export async function restartContainer(containerId: string): Promise<void> {
  await docker.getContainer(containerId).restart();
}

/** Inspects a container and reports whether it is running, stopped or gone. */
export async function getContainerState(
  containerId: string,
): Promise<ContainerState> {
  try {
    const info = await docker.getContainer(containerId).inspect();
    return info.State.Running ? 'running' : 'stopped';
  } catch {
    return 'missing';
  }
}

/**
 * Streams a container's console output (the recent history, then live).
 */
export async function attachConsole(
  containerId: string,
  onData: (text: string) => void,
): Promise<() => void> {
  const container = docker.getContainer(containerId);
  const logStream = (await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail: 200,
  })) as unknown as Readable;

  // Docker multiplexes stdout and stderr into one stream; demux them back.
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  container.modem.demuxStream(logStream, stdout, stderr);

  const forward = (chunk: Buffer): void =>
    onData(cleanConsoleText(chunk.toString('utf8')));
  stdout.on('data', forward);
  stderr.on('data', forward);

  return () => {
    logStream.destroy();
    stdout.destroy();
    stderr.destroy();
  };
}

/**
 * Sends a console command to a running game server via the RCON client
 * bundled in the itzg/minecraft-server image, and returns its output.
 */
export async function sendConsoleCommand(
  containerId: string,
  command: string,
): Promise<string> {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ['rcon-cli', command],
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
  });

  const stream = (await exec.start({})) as unknown as Readable;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return cleanConsoleText(Buffer.concat(chunks).toString('utf8')).trim();
}
