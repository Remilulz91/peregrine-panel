import fs from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import {
  Server as SshServer,
  utils as sshUtils,
  type AuthContext,
  type Connection,
  type FileEntry,
  type SFTPWrapper,
} from 'ssh2';
import { config } from '../config';
import { verifyPassword } from '../lib/password';
import { findUserByUsername, type UserRecord } from '../lib/users';
import { getServer } from '../lib/servers';
import { effectivePermissions, getSubuser } from '../lib/subusers';
import { PERMISSION } from '../lib/permissions';
import { logActivity } from '../lib/activity';
import { logAuthEvent } from '../lib/authEvents';
import { isRateLimited, recordAttempt, clearAttempts } from '../lib/rateLimit';

const { STATUS_CODE, OPEN_MODE } = sshUtils.sftp;

// v0.23.0+: 5 failed SFTP auth attempts per IP within 15 minutes
// triggers a 15-minute lockout, mirroring fail2ban-style throttling.
const SFTP_LIMIT = { max: 5, windowMs: 15 * 60_000, lockoutMs: 15 * 60_000 };

/**
 * In-process SFTP server. Authenticates against the panel user DB and
 * gives each session a chroot-style view of the requested server's data
 * directory, with files.write / files.delete subuser permissions
 * applied at every operation.
 *
 * Username format: <panel-username>.<server-id>
 * Password: the user's panel password (Argon2-verified)
 *
 * SECURITY NOTE: SSH/SFTP has no native concept of a second factor in
 * the way HTTP does, so MFA-enabled accounts can still log in with
 * just their password. The UI surfaces a clear warning for those users.
 */

/** Loads the SSH host key from disk, generating one on first run. */
function loadOrCreateHostKey(): Buffer {
  if (fs.existsSync(config.sftpHostKeyPath)) {
    return fs.readFileSync(config.sftpHostKeyPath);
  }
  // ssh2 parses PEM-encoded PKCS1 RSA keys out of the box; Ed25519 in
  // PKCS8 isn't supported. RSA-2048 is plenty for an SFTP host key.
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  fs.mkdirSync(path.dirname(config.sftpHostKeyPath), { recursive: true });
  fs.writeFileSync(config.sftpHostKeyPath, privateKey, { mode: 0o600 });
  return Buffer.from(privateKey);
}

interface AuthedSession {
  user: UserRecord;
  serverId: string;
  /** Absolute host path that is the SFTP root for this session. */
  root: string;
  canWrite: boolean;
  canDelete: boolean;
}

/**
 * Verifies the (username, password) pair, decodes the server id from
 * the username, and confirms the user has visibility on that server.
 */
async function authenticate(
  username: string,
  password: string,
): Promise<AuthedSession | null> {
  // Format: <panel-username>.<server-id>. Server id is a UUID with
  // dashes, so we split on the LAST dot from the left.
  const sep = username.lastIndexOf('.');
  if (sep <= 0 || sep === username.length - 1) {
    return null;
  }
  const panelUsername = username.slice(0, sep);
  const serverId = username.slice(sep + 1);

  const user = findUserByUsername(panelUsername);
  if (!user) return null;
  if (!(await verifyPassword(user.passwordHash, password))) return null;

  const server = getServer(serverId);
  if (!server) return null;

  const isOwner = server.ownerId === user.id;
  const isAdmin = user.role === 'ADMIN';
  const isSubuser =
    !isOwner && !isAdmin && getSubuser(server.id, user.id) !== null;
  if (!isOwner && !isAdmin && !isSubuser) return null;

  const granted = effectivePermissions({
    serverId: server.id,
    userId: user.id,
    role: user.role,
    ownerId: server.ownerId,
  });

  return {
    user,
    serverId: server.id,
    root: path.resolve(config.serversPath, server.id),
    canWrite: granted.includes(PERMISSION.FILES_WRITE),
    canDelete: granted.includes(PERMISSION.FILES_DELETE),
  };
}

/**
 * Resolves an SFTP path (POSIX-style, possibly absolute, possibly with
 * "..") to an absolute host path, guaranteeing the result stays within
 * `root`. Returns null on any escape attempt.
 */
function safeJoin(root: string, requested: string): string | null {
  const rel = requested.replace(/^[/\\]+/, '');
  const candidate = path.resolve(root, rel);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    return null;
  }
  return candidate;
}

/** Converts an `fs.Stats` value into the attribute shape SFTP expects. */
function attrsForStats(stats: fs.Stats): {
  mode: number;
  uid: number;
  gid: number;
  size: number;
  atime: number;
  mtime: number;
} {
  return {
    mode: stats.mode,
    uid: stats.uid,
    gid: stats.gid,
    size: stats.size,
    atime: Math.floor(stats.atimeMs / 1000),
    mtime: Math.floor(stats.mtimeMs / 1000),
  };
}

/** Builds a one-line "ls -l"-style string used in directory listings. */
function longname(name: string, stats: fs.Stats): string {
  const isDir = stats.isDirectory();
  const type = isDir ? 'd' : '-';
  const perm = (stats.mode & 0o777).toString(8).padStart(3, '0');
  const date = new Date(stats.mtimeMs).toISOString().slice(5, 16);
  return `${type}${perm} ${String(stats.size).padStart(10)} ${date} ${name}`;
}

/** Installs the SFTP handlers for one authenticated session. */
function attachSftpHandlers(sftp: SFTPWrapper, session: AuthedSession): void {
  let nextHandle = 1;
  const fileHandles = new Map<number, { fd: number; path: string }>();
  const dirHandles = new Map<
    number,
    { entries: FileEntry[]; sent: boolean }
  >();

  function parseHandle(h: Buffer): number {
    return h.length === 4 ? h.readUInt32BE(0) : -1;
  }

  // Path operations -------------------------------------------------------

  sftp.on('REALPATH', (reqid, requested) => {
    const candidate = requested === '.' ? '/' : requested;
    const resolved = safeJoin(session.root, candidate);
    if (!resolved) {
      sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
      return;
    }
    const rel = '/' + path.relative(session.root, resolved).replace(/\\/g, '/');
    const emptyAttrs = {
      mode: 0o040755,
      uid: 0,
      gid: 0,
      size: 0,
      atime: 0,
      mtime: 0,
    };
    sftp.name(reqid, [
      {
        filename: rel === '//' ? '/' : rel,
        longname: rel,
        attrs: emptyAttrs,
      },
    ]);
  });

  sftp.on('STAT', (reqid, p) => {
    const abs = safeJoin(session.root, p);
    if (!abs) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    fs.stat(abs, (err, stats) => {
      if (err) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
      sftp.attrs(reqid, attrsForStats(stats));
    });
  });

  sftp.on('LSTAT', (reqid, p) => {
    const abs = safeJoin(session.root, p);
    if (!abs) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    fs.lstat(abs, (err, stats) => {
      if (err) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
      sftp.attrs(reqid, attrsForStats(stats));
    });
  });

  sftp.on('FSTAT', (reqid, handle) => {
    const id = parseHandle(handle);
    const entry = fileHandles.get(id);
    if (!entry) return sftp.status(reqid, STATUS_CODE.FAILURE);
    fs.fstat(entry.fd, (err, stats) => {
      if (err) return sftp.status(reqid, STATUS_CODE.FAILURE);
      sftp.attrs(reqid, attrsForStats(stats));
    });
  });

  // Directory listing -----------------------------------------------------

  sftp.on('OPENDIR', (reqid, p) => {
    const abs = safeJoin(session.root, p);
    if (!abs) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    fs.readdir(abs, { withFileTypes: true }, (err, dirents) => {
      if (err) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
      const entries: FileEntry[] = [];
      for (const dirent of dirents) {
        let stats: fs.Stats;
        try {
          stats = fs.lstatSync(path.join(abs, dirent.name));
        } catch {
          continue;
        }
        entries.push({
          filename: dirent.name,
          longname: longname(dirent.name, stats),
          attrs: attrsForStats(stats),
        });
      }
      const id = nextHandle++;
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(id, 0);
      dirHandles.set(id, { entries, sent: false });
      sftp.handle(reqid, buf);
    });
  });

  sftp.on('READDIR', (reqid, handle) => {
    const id = parseHandle(handle);
    const state = dirHandles.get(id);
    if (!state) return sftp.status(reqid, STATUS_CODE.FAILURE);
    if (state.sent) return sftp.status(reqid, STATUS_CODE.EOF);
    state.sent = true;
    sftp.name(reqid, state.entries);
  });

  // File reads/writes -----------------------------------------------------

  sftp.on('OPEN', (reqid, filename, flags) => {
    const abs = safeJoin(session.root, filename);
    if (!abs) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);

    const writing =
      (flags & OPEN_MODE.WRITE) !== 0 ||
      (flags & OPEN_MODE.APPEND) !== 0 ||
      (flags & OPEN_MODE.CREAT) !== 0 ||
      (flags & OPEN_MODE.TRUNC) !== 0;
    if (writing && !session.canWrite) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }

    let fsFlags = 'r';
    if ((flags & OPEN_MODE.WRITE) !== 0 && (flags & OPEN_MODE.READ) !== 0) {
      fsFlags = (flags & OPEN_MODE.CREAT) !== 0 ? 'w+' : 'r+';
    } else if ((flags & OPEN_MODE.WRITE) !== 0) {
      if ((flags & OPEN_MODE.APPEND) !== 0) fsFlags = 'a';
      else if ((flags & OPEN_MODE.EXCL) !== 0) fsFlags = 'wx';
      else fsFlags = 'w';
    } else if ((flags & OPEN_MODE.APPEND) !== 0) {
      fsFlags = 'a';
    }

    fs.open(abs, fsFlags, 0o644, (err, fd) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.warn(`[sftp] OPEN failed for ${abs} (flags=${fsFlags}): ${err.message}`);
        return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
      }
      // v0.20.0+: align ownership on every write-mode OPEN so itzg
      // (running as UID 1000) can read AND write. fchown/fchmod use the
      // open fd, which works on both freshly-created files and ones the
      // user is overwriting. Failures are swallowed (e.g. process not
      // root in a non-Docker dev setup) — the upload still succeeds
      // and the user can fix perms with a manual chown if needed.
      if (writing) {
        fs.fchown(fd, config.containerUid, config.containerGid, () => undefined);
        fs.fchmod(fd, config.containerFileMode, () => undefined);
      }
      const id = nextHandle++;
      const buf = Buffer.alloc(4);
      buf.writeUInt32BE(id, 0);
      fileHandles.set(id, { fd, path: abs });
      sftp.handle(reqid, buf);
    });
  });

  sftp.on('READ', (reqid, handle, offset, length) => {
    const id = parseHandle(handle);
    const entry = fileHandles.get(id);
    if (!entry) return sftp.status(reqid, STATUS_CODE.FAILURE);
    const buf = Buffer.alloc(length);
    fs.read(entry.fd, buf, 0, length, offset, (err, bytesRead) => {
      if (err) return sftp.status(reqid, STATUS_CODE.FAILURE);
      if (bytesRead === 0) return sftp.status(reqid, STATUS_CODE.EOF);
      sftp.data(reqid, buf.slice(0, bytesRead));
    });
  });

  sftp.on('WRITE', (reqid, handle, offset, data) => {
    const id = parseHandle(handle);
    const entry = fileHandles.get(id);
    if (!entry) return sftp.status(reqid, STATUS_CODE.FAILURE);
    if (!session.canWrite) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }
    fs.write(entry.fd, data, 0, data.length, offset, (err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.warn(`[sftp] WRITE failed for ${entry.path} @${offset}: ${err.message}`);
        return sftp.status(reqid, STATUS_CODE.FAILURE);
      }
      sftp.status(reqid, STATUS_CODE.OK);
    });
  });

  sftp.on('CLOSE', (reqid, handle) => {
    const id = parseHandle(handle);
    const file = fileHandles.get(id);
    if (file) {
      fileHandles.delete(id);
      fs.close(file.fd, () => sftp.status(reqid, STATUS_CODE.OK));
      return;
    }
    if (dirHandles.has(id)) {
      dirHandles.delete(id);
      return sftp.status(reqid, STATUS_CODE.OK);
    }
    sftp.status(reqid, STATUS_CODE.FAILURE);
  });

  // Mutations -------------------------------------------------------------

  sftp.on('MKDIR', (reqid, p) => {
    if (!session.canWrite) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }
    const abs = safeJoin(session.root, p);
    if (!abs) return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    fs.mkdir(abs, { recursive: false }, (err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.warn(`[sftp] MKDIR failed for ${abs}: ${err.message}`);
        return sftp.status(reqid, STATUS_CODE.FAILURE);
      }
      // v0.20.0+: align ownership on the new directory so itzg can
      // write inside it. See OPEN handler for the rationale.
      fs.chown(abs, config.containerUid, config.containerGid, () => undefined);
      fs.chmod(abs, config.containerDirMode, () => undefined);
      sftp.status(reqid, STATUS_CODE.OK);
    });
  });

  sftp.on('RMDIR', (reqid, p) => {
    if (!session.canDelete) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }
    const abs = safeJoin(session.root, p);
    if (!abs || abs === session.root) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }
    fs.rmdir(abs, (err) => {
      if (err) return sftp.status(reqid, STATUS_CODE.FAILURE);
      sftp.status(reqid, STATUS_CODE.OK);
    });
  });

  sftp.on('REMOVE', (reqid, p) => {
    if (!session.canDelete) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }
    const abs = safeJoin(session.root, p);
    if (!abs || abs === session.root) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }
    fs.unlink(abs, (err) => {
      if (err) return sftp.status(reqid, STATUS_CODE.FAILURE);
      sftp.status(reqid, STATUS_CODE.OK);
    });
  });

  sftp.on('RENAME', (reqid, oldPath, newPath) => {
    if (!session.canWrite) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }
    const fromAbs = safeJoin(session.root, oldPath);
    const toAbs = safeJoin(session.root, newPath);
    if (!fromAbs || !toAbs) {
      return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
    }
    fs.rename(fromAbs, toAbs, (err) => {
      if (err) return sftp.status(reqid, STATUS_CODE.FAILURE);
      sftp.status(reqid, STATUS_CODE.OK);
    });
  });

  sftp.on('SETSTAT', (reqid) => sftp.status(reqid, STATUS_CODE.OK));
  sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, STATUS_CODE.OK));

  sftp.on('close', () => {
    for (const { fd } of fileHandles.values()) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    fileHandles.clear();
    dirHandles.clear();
  });
}

/**
 * Starts the SFTP server. No-op when SFTP_PORT is 0. Returns a stop
 * function for graceful shutdown (used in tests).
 */
export function startSftpServer(): () => void {
  if (config.sftpPort <= 0) {
    return () => undefined;
  }

  const hostKey = loadOrCreateHostKey();

  const server = new SshServer(
    { hostKeys: [hostKey] },
    (client: Connection, info: { ip: string }) => {
      let session: AuthedSession | null = null;

      client.on('authentication', (ctx: AuthContext) => {
        const ip = info?.ip ?? '?';
        if (isRateLimited(ip, SFTP_LIMIT)) {
          logAuthEvent({
            kind: 'auth.sftp_rate_limited',
            username: ctx.username,
            remoteIp: ip,
          });
          return ctx.reject(['password']);
        }
        if (ctx.method !== 'password') {
          return ctx.reject(['password']);
        }
        void authenticate(ctx.username, ctx.password)
          .then((result) => {
            if (!result) {
              recordAttempt(ip, SFTP_LIMIT);
              logAuthEvent({
                kind: 'auth.sftp_failed',
                username: ctx.username,
                remoteIp: ip,
              });
              ctx.reject(['password']);
              return;
            }
            clearAttempts(ip);
            session = result;
            logActivity({
              serverId: result.serverId,
              actorId: result.user.id,
              kind: 'sftp.connect',
            });
            logAuthEvent({
              kind: 'auth.sftp_login',
              userId: result.user.id,
              username: ctx.username,
              remoteIp: ip,
              details: `server=${result.serverId}`,
            });
            ctx.accept();
          })
          .catch(() => {
            recordAttempt(ip, SFTP_LIMIT);
            ctx.reject(['password']);
          });
      });

      client.on('ready', () => {
        client.on('session', (accept) => {
          const sess = accept();
          sess.on('sftp', (acceptSftp) => {
            const sftp = acceptSftp();
            if (!session) {
              try {
                sftp.end();
              } catch {
                // ignore
              }
              return;
            }
            attachSftpHandlers(sftp, session);
          });
        });
      });

      client.on('error', () => {
        // ssh2 emits an error for every banal client mistake.
      });
    },
  );

  server.listen(config.sftpPort, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log('SFTP server listening on port ' + String(config.sftpPort));
  });

  return () => {
    server.close();
  };
}
