import fs from 'node:fs';
import path from 'node:path';
import { serverDataDir } from '../services/provisioning';

// Files larger than this cannot be opened in the text editor.
const MAX_EDITABLE_BYTES = 1024 * 1024;

/** One entry (file or directory) inside a server's files. */
export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
}

/**
 * Resolves a user-supplied path safely inside a server's data directory.
 *
 * This is the key defence against "path traversal": a request such as
 * `../../etc/passwd` resolves to a path outside the server folder, which is
 * rejected here before any file operation runs.
 */
export function resolveServerPath(
  serverId: string,
  relativePath: string,
): string {
  const root = path.resolve(serverDataDir(serverId));
  const cleaned = relativePath.replace(/^[/\\]+/, '');
  const resolved = path.resolve(root, cleaned);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error('Path is outside the server directory.');
  }
  return resolved;
}

/** Lists the entries of a directory inside a server. */
export function listDirectory(
  serverId: string,
  relativePath: string,
): FileEntry[] {
  const dir = resolveServerPath(serverId, relativePath);
  const dirents = fs.readdirSync(dir, { withFileTypes: true });

  const entries: FileEntry[] = dirents.map((dirent) => {
    const isDirectory = dirent.isDirectory();
    let size = 0;
    if (!isDirectory) {
      try {
        size = fs.statSync(path.join(dir, dirent.name)).size;
      } catch {
        size = 0;
      }
    }
    return {
      name: dirent.name,
      type: isDirectory ? 'directory' : 'file',
      size,
    };
  });

  // Directories first, then files, each sorted alphabetically.
  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return entries;
}

/** Reads a text file inside a server. Refuses large or binary files. */
export function readTextFile(serverId: string, relativePath: string): string {
  const file = resolveServerPath(serverId, relativePath);
  const stat = fs.statSync(file);
  if (!stat.isFile()) {
    throw new Error('Not a file.');
  }
  if (stat.size > MAX_EDITABLE_BYTES) {
    throw new Error('File is too large to edit.');
  }
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) {
    throw new Error('File is not a text file.');
  }
  return buffer.toString('utf8');
}

/** Writes text content to a file inside a server. */
export function writeTextFile(
  serverId: string,
  relativePath: string,
  content: string,
): void {
  const file = resolveServerPath(serverId, relativePath);
  fs.writeFileSync(file, content, 'utf8');
}

/** Deletes a file or directory inside a server. */
export function deleteEntry(serverId: string, relativePath: string): void {
  const target = resolveServerPath(serverId, relativePath);
  const root = path.resolve(serverDataDir(serverId));
  if (target === root) {
    throw new Error('Cannot delete the server root.');
  }
  fs.rmSync(target, { recursive: true, force: true });
}

/** Saves an uploaded file into a directory inside a server. */
export function saveUploadedFile(
  serverId: string,
  relativeDir: string,
  filename: string,
  data: Buffer,
): void {
  // Keep only the base name — never a path coming from the client.
  const safeName = path.basename(filename);
  if (!safeName || safeName === '.' || safeName === '..') {
    throw new Error('Invalid file name.');
  }
  const dir = resolveServerPath(serverId, relativeDir);
  const dest = resolveServerPath(serverId, path.join(relativeDir, safeName));
  if (path.dirname(dest) !== dir) {
    throw new Error('Invalid upload path.');
  }
  fs.writeFileSync(dest, data);
}
