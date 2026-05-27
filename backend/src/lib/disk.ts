import { statfs } from 'node:fs/promises';

/** A snapshot of the disk holding a given path, in bytes. */
export interface DiskUsage {
  /** Total size of the filesystem. */
  totalBytes: number;
  /** Bytes currently available (after the reserve, see below). */
  freeBytes: number;
  /** Bytes used = total - free. */
  usedBytes: number;
  /**
   * Bytes Peregrine will refuse to write below — the safety margin so a
   * runaway server never fills the disk completely and crashes others.
   * Computed as max(2 GiB, 5% of total).
   */
  reservedBytes: number;
}

/** 2 GiB in bytes — the absolute floor for the safety reserve. */
const RESERVED_MIN_BYTES = 2 * 1024 * 1024 * 1024;

/** Fraction of the disk kept untouched, on top of the 2 GiB floor. */
const RESERVED_FRACTION = 0.05;

/**
 * Inspects the filesystem that hosts `path` and returns its usage.
 * Uses `statfs(2)` under the hood, so it works for any directory on
 * the panel (data, backups, ...).
 */
export async function getDiskUsage(path: string): Promise<DiskUsage> {
  const info = await statfs(path);
  // statfs returns block counts. `bsize` is the block size in bytes,
  // `bavail` is the blocks usable by non-root processes.
  const totalBytes = Number(info.blocks) * Number(info.bsize);
  const freeBytes = Number(info.bavail) * Number(info.bsize);
  const usedBytes = totalBytes - freeBytes;
  const reservedBytes = Math.max(
    RESERVED_MIN_BYTES,
    Math.floor(totalBytes * RESERVED_FRACTION),
  );
  return { totalBytes, freeBytes, usedBytes, reservedBytes };
}

/**
 * Throws DiskFullError if writing `additionalBytes` to the filesystem
 * holding `path` would breach the safety reserve. Pass 0 (the default)
 * to just check that the disk is not currently below the reserve.
 */
export async function assertEnoughFreeSpace(
  path: string,
  additionalBytes = 0,
): Promise<void> {
  const usage = await getDiskUsage(path);
  // Add a 20% headroom so we are conservative about backup-size estimates.
  const required = Math.ceil(additionalBytes * 1.2);
  if (usage.freeBytes - required < usage.reservedBytes) {
    throw new DiskFullError(usage, required);
  }
}

/** Raised when a write would push the disk under its safety reserve. */
export class DiskFullError extends Error {
  readonly usage: DiskUsage;
  readonly requiredBytes: number;

  constructor(usage: DiskUsage, requiredBytes: number) {
    super('Not enough free disk space.');
    this.name = 'DiskFullError';
    this.usage = usage;
    this.requiredBytes = requiredBytes;
  }
}
