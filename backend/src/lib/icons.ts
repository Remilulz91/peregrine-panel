import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

/** Returns the absolute path where a server's icon would live. */
export function iconPath(serverId: string): string {
  // Server ids are UUIDs (no path separators), so direct concat is safe.
  return path.join(config.iconsPath, `${serverId}.png`);
}

/** Returns true when the server has an uploaded icon. */
export function hasIcon(serverId: string): boolean {
  try {
    return fs.statSync(iconPath(serverId)).isFile();
  } catch {
    return false;
  }
}

/**
 * Returns the icon's last-modified timestamp in milliseconds, or
 * null when no icon is set. Used by the frontend for cache busting:
 * the `<img src>` includes `?v=<this>` so a re-uploaded icon shows
 * up immediately instead of being served from the browser cache.
 */
export function iconUpdatedAt(serverId: string): number | null {
  try {
    const stats = fs.statSync(iconPath(serverId));
    return Math.floor(stats.mtimeMs);
  } catch {
    return null;
  }
}

/** PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A. */
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** True when the buffer starts with the PNG magic bytes. */
export function isPng(data: Buffer): boolean {
  if (data.length < PNG_MAGIC.length) return false;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (data[i] !== PNG_MAGIC[i]) return false;
  }
  return true;
}

/** Writes the icon to disk, creating the directory on first use. */
export function writeIcon(serverId: string, data: Buffer): void {
  fs.mkdirSync(config.iconsPath, { recursive: true });
  fs.writeFileSync(iconPath(serverId), data, { mode: 0o644 });
}

/** Removes the icon file if it exists. Safe to call when there's none. */
export function removeIcon(serverId: string): void {
  try {
    fs.unlinkSync(iconPath(serverId));
  } catch {
    // Nothing to do — already absent.
  }
}
