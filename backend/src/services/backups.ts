import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { config } from '../config';
import {
  assertEnoughFreeSpace,
  DiskFullError,
} from '../lib/disk';
import {
  countBackupsForServer,
  createBackupRow,
  deleteBackupRow,
  getBackup,
  MAX_BACKUPS_PER_SERVER,
  oldestBackupForServer,
  type BackupRecord,
} from '../lib/backups';
import type { ServerRecord } from '../lib/servers';
import { serverDataDir } from './provisioning';

export { DiskFullError };

/** Per-server directory where backup archives live. */
function backupDirFor(serverId: string): string {
  return path.join(config.backupsPath, serverId);
}

/** Absolute file path for a fresh backup archive. */
function newBackupFilePath(serverId: string): string {
  return path.join(backupDirFor(serverId), `${randomUUID()}.tar.gz`);
}

/**
 * Measures the on-disk size (in bytes) of a directory using the system
 * `du -sb` command. Much faster than walking the tree from Node when the
 * server has thousands of files.
 */
export function measureDirectorySize(dir: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // `du -sb` prints "<bytes>\t<path>". Use --apparent-size? No — we
    // want actual on-disk usage so the estimate matches what the backup
    // will consume.
    const proc = spawn('du', ['-sb', dir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`du exited ${code}: ${stderr.trim()}`));
        return;
      }
      const value = Number.parseInt(stdout.split(/\s+/)[0] ?? '0', 10);
      resolve(Number.isFinite(value) ? value : 0);
    });
  });
}

/** Spawns `tar -czf <archive> -C <parent> <dir>` and resolves on success. */
function runTarCreate(
  parentDir: string,
  childName: string,
  archive: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'tar',
      ['-czf', archive, '-C', parentDir, childName],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`tar create exited ${code}: ${stderr.trim()}`));
      } else {
        resolve();
      }
    });
  });
}

/** Spawns `tar -xzf <archive> -C <dir>` and resolves on success. */
function runTarExtract(archive: string, intoParent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', archive, '-C', intoParent], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`tar extract exited ${code}: ${stderr.trim()}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Creates a backup of the given server: tar.gz of its data folder,
 * recorded in the database. Throws DiskFullError if the disk reserve
 * would be breached, before any file is written.
 *
 * If the per-server cap is exceeded after this addition, the oldest
 * backup is pruned automatically.
 */
export async function createBackup(input: {
  server: ServerRecord;
  name: string;
  createdBy: string | null;
}): Promise<BackupRecord> {
  const dataDir = serverDataDir(input.server.id);
  const estimate = await measureDirectorySize(dataDir).catch(() => 0);

  // The .tar.gz is usually smaller than the raw data, but we check
  // against the raw size to stay conservative.
  fs.mkdirSync(config.backupsPath, { recursive: true });
  await assertEnoughFreeSpace(config.backupsPath, estimate);

  const backupsDir = backupDirFor(input.server.id);
  fs.mkdirSync(backupsDir, { recursive: true });

  const archivePath = newBackupFilePath(input.server.id);
  try {
    await runTarCreate(
      path.dirname(dataDir),
      path.basename(dataDir),
      archivePath,
    );
  } catch (err) {
    // Clean up a partial archive on failure so we don't leak space.
    fs.rmSync(archivePath, { force: true });
    throw err;
  }

  const stats = fs.statSync(archivePath);
  const record = createBackupRow({
    serverId: input.server.id,
    name: input.name,
    filePath: archivePath,
    sizeBytes: stats.size,
    createdBy: input.createdBy,
  });

  // Enforce the per-server cap: drop the oldest until we are at most
  // MAX_BACKUPS_PER_SERVER total.
  while (countBackupsForServer(input.server.id) > MAX_BACKUPS_PER_SERVER) {
    const oldest = oldestBackupForServer(input.server.id);
    if (!oldest) break;
    deleteBackupFiles(oldest);
  }

  return record;
}

/**
 * Restores a backup over its server's data directory. The caller MUST
 * verify the server is not currently running.
 *
 * Wipes the existing data, then extracts the archive in place. Throws
 * DiskFullError if extracting would breach the disk reserve.
 */
export async function restoreBackup(backup: BackupRecord): Promise<void> {
  // Rough heuristic for the extracted size: assume the gzipped archive
  // expands to at most ~6x its compressed size. Anything that fits in
  // the safety reserve after that goes through.
  const stats = fs.statSync(backup.filePath);
  await assertEnoughFreeSpace(config.serversPath, stats.size * 6);

  const dataDir = serverDataDir(backup.serverId);
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });

  // The archive contains a top-level folder named after the server id,
  // so extracting into the parent directory recreates the original layout.
  await runTarExtract(backup.filePath, path.dirname(dataDir));
}

/**
 * Removes both the archive file on disk and the database row for a
 * backup. Safe to call on a missing file (the row is still cleaned up).
 */
export function deleteBackupFiles(backup: BackupRecord): void {
  fs.rmSync(backup.filePath, { force: true });
  deleteBackupRow(backup.id);
}

/**
 * Removes every backup folder for a given server. Used when the server
 * itself is being deleted, in tandem with deprovisionServer.
 */
export function deleteAllBackupsForServer(serverId: string): void {
  const dir = backupDirFor(serverId);
  fs.rmSync(dir, { recursive: true, force: true });
  // DB rows cascade via the foreign key when the server row is removed.
}

/** Looks up a backup by id and verifies it belongs to the given server. */
export function getBackupForServer(
  backupId: string,
  serverId: string,
): BackupRecord | null {
  const backup = getBackup(backupId);
  return backup && backup.serverId === serverId ? backup : null;
}
