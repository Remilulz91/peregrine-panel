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

  /**
   * Host directory that holds every server's .tar.gz backups, grouped in
   * per-server sub-folders. Defaults to a sibling of SERVERS_PATH so a
   * single dedicated disk holds both live data and backups.
   */
  backupsPath:
    process.env.BACKUPS_PATH ?? path.resolve(serversPath, '../backups'),

  /** True when running the production build. */
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
};
