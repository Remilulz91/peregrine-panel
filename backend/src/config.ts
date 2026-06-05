import path from 'node:path';
import dotenv from 'dotenv';

// Loads variables from a .env file at the repository root, if one exists.
// In production (Docker), the variables are provided directly by
// docker-compose, so this load simply has no effect.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Reads a numeric environment variable, with a default value. */
function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

const defaultServersPath = path.resolve(__dirname, '../../data/servers');
const serversPath = process.env.SERVERS_PATH ?? defaultServersPath;

/** Central application configuration, read from the environment. */
export const config = {
  /** Port the HTTP server listens on. */
  port: readNumber('PORT', 3000),

  /** Network interface to bind to. 0.0.0.0 so it works inside Docker. */
  host: process.env.HOST ?? '0.0.0.0',

  /** Runtime environment: "development" or "production". */
  nodeEnv: process.env.NODE_ENV ?? 'development',

  /** Public URL where the panel is reachable. */
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',

  /** Secret key used to sign authentication tokens (JWT). */
  jwtSecret: process.env.JWT_SECRET ?? 'peregrine-development-secret-change-me',

  /** Path to the SQLite database file. */
  databasePath:
    process.env.DATABASE_PATH ??
    path.resolve(__dirname, '../../data/peregrine.db'),

  /** Docker daemon socket used to manage game-server containers. */
  dockerSocket: process.env.DOCKER_SOCKET ?? '/var/run/docker.sock',

  /**
   * Host directory that holds every game server's files. Each server gets
   * its own sub-folder, which is bind-mounted into its container.
   * IMPORTANT: this path is interpreted on the Docker host, so it must be
   * identical inside and outside the Peregrine container.
   */
  serversPath,

  /** Host directory that holds backup archives. */
  backupsPath:
    process.env.BACKUPS_PATH ?? path.resolve(serversPath, '../backups'),

  /**
   * Host directory that holds per-server icon files (PNG). Lives
   * inside the Peregrine data volume so icons survive container
   * rebuilds. Defaults to <data>/icons.
   */
  iconsPath:
    process.env.ICONS_PATH ??
    path.resolve(__dirname, '../../data/icons'),

  /**
   * RAM (in MiB) kept untouched on the host as a safety margin for the
   * OS, Docker and Peregrine itself. The create / resize endpoints
   * refuse any allocation that would push usage past `total - reserved`.
   *
   * Default: 512 MiB — the realistic minimum for Debian + Docker
   * daemon + the Peregrine container + Caddy + fail2ban. Bump it on
   * bigger hosts if you want more breathing room (1024 is a common
   * "comfortable" value).
   */
  reservedMemMb: readNumber('RESERVED_MEM_MB', 512),

  /**
   * CPU cores (can be fractional, e.g. 0.5) kept untouched on the host
   * as a safety margin. Default: 0.5 — the host stack is mostly idle
   * so half a core is plenty. Bump it on production-grade hosts that
   * run other workloads alongside Peregrine.
   */
  reservedCpus: readNumber('RESERVED_CPUS', 0.5),

  /** Port the built-in SFTP server listens on (0 disables it). */
  sftpPort: readNumber('SFTP_PORT', 2022),

  /**
   * v0.20.0+: itzg's Minecraft images run as UID 1000 / GID 1000 and
   * expect files in /data to be owned the same way. The SFTP server
   * runs in the panel container (as root), so every file/dir it
   * creates would otherwise end up as root:root with 755/644 — which
   * means itzg can read but NOT write, breaking world saves. We chown
   * + chmod after every OPEN/MKDIR to keep ownership aligned. These
   * values are configurable for non-standard images that use a
   * different UID/GID.
   */
  containerUid: readNumber('CONTAINER_UID', 1000),
  containerGid: readNumber('CONTAINER_GID', 1000),
  containerFileMode: readNumber('CONTAINER_FILE_MODE', 0o664),
  containerDirMode: readNumber('CONTAINER_DIR_MODE', 0o775),

  /**
   * Where Peregrine persists the SSH host key for its SFTP server. The
   * file is generated on first launch and reused thereafter so SFTP
   * clients don't see "host key changed" warnings across restarts.
   */
  sftpHostKeyPath:
    process.env.SFTP_HOST_KEY_PATH ??
    path.resolve(__dirname, '../../data/sftp_host_key'),

  /** True when running the production build. */
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
};
