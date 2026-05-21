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

  /** True when running the production build. */
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },
};
