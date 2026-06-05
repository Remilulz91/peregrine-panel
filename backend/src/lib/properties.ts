import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

/**
 * Game settings for Minecraft Java servers (v0.18.0+).
 *
 * These mirror a subset of the keys in `server.properties` that we
 * expose through the Game settings tab. We intentionally keep the
 * list small — these are the knobs an operator wants to flip from
 * a panel, not every esoteric option. Anything more advanced can
 * still be edited via the Files tab.
 *
 * Bedrock servers also use `server.properties` but with a different
 * key set; supporting them is intentionally deferred to a later
 * release so we don't ship a half-baked mixed schema.
 */
export interface GameSettings {
  motd: string;
  maxPlayers: number;
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator';
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard';
  pvp: boolean;
  onlineMode: boolean;
  whiteList: boolean;
  viewDistance: number;
}

const GAMEMODES: GameSettings['gamemode'][] = [
  'survival',
  'creative',
  'adventure',
  'spectator',
];
const DIFFICULTIES: GameSettings['difficulty'][] = [
  'peaceful',
  'easy',
  'normal',
  'hard',
];

/** Default values, returned when no `server.properties` exists yet. */
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  motd: 'A Minecraft Server',
  maxPlayers: 20,
  gamemode: 'survival',
  difficulty: 'easy',
  pvp: true,
  onlineMode: true,
  whiteList: false,
  viewDistance: 10,
};

/** Returns the on-disk path of a server's `server.properties` file. */
function propertiesPath(serverId: string): string {
  return path.join(config.serversPath, serverId, 'server.properties');
}

/**
 * Parses a `server.properties` file body into a plain object.
 * Blank lines and comment lines (starting with `#` or `!`) are
 * ignored. Values are kept as raw strings — typing happens in
 * `readGameSettings`.
 */
function parseProperties(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1);
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Writes the given key/value updates back into a `server.properties`
 * body, preserving original line order and any comments. Keys not
 * present in the original file are appended at the end with a
 * comment header noting they were added by Peregrine.
 */
function serializeProperties(
  original: string,
  updates: Record<string, string>,
): string {
  const remaining = new Set(Object.keys(updates));
  const lines = original.split(/\r?\n/);
  const outLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      outLines.push(line);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) {
      outLines.push(line);
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (key in updates) {
      outLines.push(`${key}=${updates[key]}`);
      remaining.delete(key);
    } else {
      outLines.push(line);
    }
  }

  if (remaining.size > 0) {
    if (
      outLines.length > 0 &&
      outLines[outLines.length - 1].trim() !== ''
    ) {
      outLines.push('');
    }
    outLines.push('# Added by Peregrine');
    for (const key of remaining) {
      outLines.push(`${key}=${updates[key]}`);
    }
  }

  return outLines.join('\n');
}

/**
 * v0.20.1+: when a value in `server.properties` is unrecognised (e.g.
 * the user hand-edited `difficulty=normals`), we used to silently
 * fall back to the default and the UI would just show the default —
 * the user couldn't tell their typo had been ignored. Now every
 * fallback records a warning that the GET route forwards to the UI,
 * which displays them as an inline banner above the Game form.
 */
export interface GameSettingsWarning {
  /** Key as it appears in `server.properties` (e.g. 'difficulty'). */
  key: string;
  /** Value the user actually wrote in the file. */
  rawValue: string;
  /** Value the UI is showing in its place. */
  fallback: string;
  /** Reason the raw value was rejected. */
  reason:
    | 'not_in_enum'
    | 'not_a_boolean'
    | 'not_an_integer'
    | 'out_of_range';
}

/** Coerces a `server.properties` boolean string, recording a warning on failure. */
function parseBool(
  key: string,
  raw: string | undefined,
  fallback: boolean,
  warnings: GameSettingsWarning[],
): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  warnings.push({
    key,
    rawValue: raw,
    fallback: fallback ? 'true' : 'false',
    reason: 'not_a_boolean',
  });
  return fallback;
}

/** Coerces a `server.properties` integer string, with clamping + warnings. */
function parseInt0(
  key: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  warnings: GameSettingsWarning[],
): number {
  if (raw === undefined) return fallback;
  const trimmed = raw.trim();
  const n = parseInt(trimmed, 10);
  if (!Number.isFinite(n) || String(n) !== trimmed) {
    warnings.push({
      key,
      rawValue: raw,
      fallback: String(fallback),
      reason: 'not_an_integer',
    });
    return fallback;
  }
  if (n < min || n > max) {
    const clamped = Math.min(max, Math.max(min, n));
    warnings.push({
      key,
      rawValue: raw,
      fallback: String(clamped),
      reason: 'out_of_range',
    });
    return clamped;
  }
  return n;
}

/**
 * Reads the current game settings from a server's `server.properties`,
 * along with any warnings about values that were rejected and replaced
 * by their default. The UI uses the warnings to surface typos like
 * `difficulty=normals` instead of silently snapping to `easy`.
 *
 * Returns the defaults and no warnings if the file doesn't exist yet
 * (e.g. the server hasn't booted for the first time, so the itzg
 * entrypoint has not generated it).
 */
export function readGameSettings(serverId: string): {
  settings: GameSettings;
  warnings: GameSettingsWarning[];
} {
  const file = propertiesPath(serverId);
  let body: string;
  try {
    body = fs.readFileSync(file, 'utf8');
  } catch {
    return { settings: { ...DEFAULT_GAME_SETTINGS }, warnings: [] };
  }
  const props = parseProperties(body);
  const warnings: GameSettingsWarning[] = [];

  let gamemode: GameSettings['gamemode'] = DEFAULT_GAME_SETTINGS.gamemode;
  if (props['gamemode'] !== undefined) {
    const rawGamemode = props['gamemode'].trim().toLowerCase();
    if ((GAMEMODES as string[]).includes(rawGamemode)) {
      gamemode = rawGamemode as GameSettings['gamemode'];
    } else {
      warnings.push({
        key: 'gamemode',
        rawValue: props['gamemode'],
        fallback: DEFAULT_GAME_SETTINGS.gamemode,
        reason: 'not_in_enum',
      });
    }
  }

  let difficulty: GameSettings['difficulty'] = DEFAULT_GAME_SETTINGS.difficulty;
  if (props['difficulty'] !== undefined) {
    const rawDifficulty = props['difficulty'].trim().toLowerCase();
    if ((DIFFICULTIES as string[]).includes(rawDifficulty)) {
      difficulty = rawDifficulty as GameSettings['difficulty'];
    } else {
      warnings.push({
        key: 'difficulty',
        rawValue: props['difficulty'],
        fallback: DEFAULT_GAME_SETTINGS.difficulty,
        reason: 'not_in_enum',
      });
    }
  }

  const settings: GameSettings = {
    motd: props['motd'] ?? DEFAULT_GAME_SETTINGS.motd,
    maxPlayers: parseInt0(
      'max-players',
      props['max-players'],
      DEFAULT_GAME_SETTINGS.maxPlayers,
      1,
      200,
      warnings,
    ),
    gamemode,
    difficulty,
    pvp: parseBool('pvp', props['pvp'], DEFAULT_GAME_SETTINGS.pvp, warnings),
    onlineMode: parseBool(
      'online-mode',
      props['online-mode'],
      DEFAULT_GAME_SETTINGS.onlineMode,
      warnings,
    ),
    whiteList: parseBool(
      'white-list',
      props['white-list'],
      DEFAULT_GAME_SETTINGS.whiteList,
      warnings,
    ),
    viewDistance: parseInt0(
      'view-distance',
      props['view-distance'],
      DEFAULT_GAME_SETTINGS.viewDistance,
      3,
      32,
      warnings,
    ),
  };
  return { settings, warnings };
}

/**
 * Validates the supplied partial update against the GameSettings
 * schema and returns a normalised version. Throws a plain Error on
 * any invalid field — the route layer turns that into a 400.
 */
export function validateGameSettings(input: unknown): GameSettings {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid payload.');
  }
  const i = input as Record<string, unknown>;

  if (typeof i.motd !== 'string' || i.motd.length > 200) {
    throw new Error('Invalid MOTD.');
  }
  if (
    typeof i.maxPlayers !== 'number' ||
    !Number.isInteger(i.maxPlayers) ||
    i.maxPlayers < 1 ||
    i.maxPlayers > 200
  ) {
    throw new Error('max-players must be an integer between 1 and 200.');
  }
  if (
    typeof i.gamemode !== 'string' ||
    !(GAMEMODES as string[]).includes(i.gamemode)
  ) {
    throw new Error('Invalid gamemode.');
  }
  if (
    typeof i.difficulty !== 'string' ||
    !(DIFFICULTIES as string[]).includes(i.difficulty)
  ) {
    throw new Error('Invalid difficulty.');
  }
  if (typeof i.pvp !== 'boolean') throw new Error('pvp must be a boolean.');
  if (typeof i.onlineMode !== 'boolean') {
    throw new Error('onlineMode must be a boolean.');
  }
  if (typeof i.whiteList !== 'boolean') {
    throw new Error('whiteList must be a boolean.');
  }
  if (
    typeof i.viewDistance !== 'number' ||
    !Number.isInteger(i.viewDistance) ||
    i.viewDistance < 3 ||
    i.viewDistance > 32
  ) {
    throw new Error('view-distance must be an integer between 3 and 32.');
  }

  return {
    motd: i.motd.replace(/[\r\n]/g, ' '),
    maxPlayers: i.maxPlayers,
    gamemode: i.gamemode as GameSettings['gamemode'],
    difficulty: i.difficulty as GameSettings['difficulty'],
    pvp: i.pvp,
    onlineMode: i.onlineMode,
    whiteList: i.whiteList,
    viewDistance: i.viewDistance,
  };
}

/**
 * Writes new game settings to a server's `server.properties`,
 * preserving any other keys and comments already present in the
 * file. If the file does not exist yet, it is created from scratch
 * with just the keys we manage.
 */
export function writeGameSettings(
  serverId: string,
  settings: GameSettings,
): void {
  const file = propertiesPath(serverId);
  const updates: Record<string, string> = {
    motd: settings.motd,
    'max-players': String(settings.maxPlayers),
    gamemode: settings.gamemode,
    difficulty: settings.difficulty,
    pvp: settings.pvp ? 'true' : 'false',
    'online-mode': settings.onlineMode ? 'true' : 'false',
    'white-list': settings.whiteList ? 'true' : 'false',
    'view-distance': String(settings.viewDistance),
  };

  let original = '';
  try {
    original = fs.readFileSync(file, 'utf8');
  } catch {
    // File doesn't exist yet — make sure the directory does.
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const body = serializeProperties(original, updates);
  fs.writeFileSync(file, body, { encoding: 'utf8', mode: 0o644 });
}
/**
 * Reads the `rcon.password` value from a server's `server.properties`
 * (v0.22.3+). Returns null when the file is missing or the key isn't
 * present. The caller passes this to `rcon-cli --password ...` so the
 * tool authenticates against Minecraft regardless of the container's
 * `RCON_PASSWORD` env var (which on imported servers may not match).
 */
export function readRconPassword(serverId: string): string | null {
  const file = propertiesPath(serverId);
  let body: string;
  try {
    body = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const props = parseProperties(body);
  const raw = props['rcon.password'];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
