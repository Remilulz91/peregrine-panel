import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Returns the disk usage of a directory in MiB. Uses `du -sb` so the
 * answer is byte-accurate and a single fork — much faster than walking
 * the tree with fs.stat in Node. Returns 0 when the directory doesn't
 * exist yet (newly-created server before its data folder lands).
 */
export function getDirectorySizeMb(dirPath: string): Promise<number> {
  return new Promise((resolve) => {
    if (!existsSync(dirPath)) {
      resolve(0);
      return;
    }
    // `du -sb` prints "<bytes>\t<path>". We only care about the first
    // field. On Linux this is one fork; on a 5 GiB server data folder
    // it returns in a few ms.
    execFile(
      'du',
      ['-sb', dirPath],
      { maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          // du can fail (permission denied on a stray file, race with
          // the container writing). Treat as unknown = 0 rather than
          // bubbling the error — the next tick will retry.
          resolve(0);
          return;
        }
        const firstField = stdout.split(/\s/, 1)[0];
        const bytes = Number(firstField);
        if (!Number.isFinite(bytes) || bytes < 0) {
          resolve(0);
          return;
        }
        resolve(Math.round(bytes / (1024 * 1024)));
      },
    );
  });
}
