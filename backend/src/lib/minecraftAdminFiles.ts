import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

/**
 * Reader helpers for Minecraft Java server access-control files
 * (v0.29.0+). The 4 files live at the root of each server's data dir
 * and are managed by the vanilla server itself:
 *
 *   - whitelist.json        — allowed players (when white-list is on)
 *   - ops.json              — operators (admin players)
 *   - banned-players.json   — banned players (by UUID)
 *   - banned-ips.json       — banned IP addresses
 *
 * We only EXPOSE them through GET routes. Writes go through RCON
 * (whitelist add / op / ban / pardon, etc.) so Minecraft itself
 * resolves names → UUIDs through Mojang, applies the change live,
 * and updates the JSON files for us. The user has to start the
 * server before modifying these lists.
 *
 * Bedrock servers use a different model (`allowlist.json` only) and
 * are intentionally excluded from this UI — the route layer returns
 * a 501 for non-Java templates.
 */

export interface WhitelistEntry {
  uuid: string;
  name: string;
}

export interface OpEntry {
  uuid: string;
  name: string;
  level: number;
  bypassesPlayerLimit?: boolean;
}

export interface BannedPlayerEntry {
  uuid: string;
  name: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

export interface BannedIpEntry {
  ip: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
}

/** Returns the on-disk path of one of the access-control files. */
function filePath(serverId: string, name: string): string {
  return path.join(config.serversPath, serverId, name);
}

/** Reads a JSON array from disk, returning `[]` when the file is missing or unreadable. */
function readJsonArray<T>(file: string): T[] {
  try {
    const body = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function readWhitelist(serverId: string): WhitelistEntry[] {
  return readJsonArray<WhitelistEntry>(filePath(serverId, 'whitelist.json'))
    .filter((e) => typeof e?.name === 'string' && typeof e?.uuid === 'string');
}

export function readOps(serverId: string): OpEntry[] {
  return readJsonArray<OpEntry>(filePath(serverId, 'ops.json'))
    .filter((e) => typeof e?.name === 'string' && typeof e?.uuid === 'string');
}

export function readBannedPlayers(serverId: string): BannedPlayerEntry[] {
  return readJsonArray<BannedPlayerEntry>(
    filePath(serverId, 'banned-players.json'),
  ).filter((e) => typeof e?.name === 'string' && typeof e?.uuid === 'string');
}

export function readBannedIps(serverId: string): BannedIpEntry[] {
  return readJsonArray<BannedIpEntry>(filePath(serverId, 'banned-ips.json'))
    .filter((e) => typeof e?.ip === 'string');
}
