import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { AUTH_COOKIE } from '../plugins/auth';
import { getServer } from '../lib/servers';
import { attachConsole, sendConsoleCommand } from '../lib/docker';
import { streamContainerStats } from '../lib/dockerStats';
import { effectivePermissions, getSubuser } from '../lib/subusers';
import { PERMISSION } from '../lib/permissions';

/** Extracts the Peregrine authentication token from a Cookie header. */
function tokenFromCookieHeader(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === AUTH_COOKIE) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

interface CommandPayload {
  serverId?: unknown;
  command?: unknown;
}

/**
 * Sets up the real-time console over Socket.IO.
 *
 * Clients authenticate with the same cookie as the REST API. Once
 * connected, a client subscribes to one of its accessible servers to
 * receive its live console output, and (if they have the
 * `console.send` permission) can send commands back to it.
 */
export function setupConsole(
  app: FastifyInstance,
  httpServer: HttpServer,
): void {
  const io = new SocketIOServer(httpServer);

  // Authenticate every socket with the JWT cookie before allowing it in.
  io.use((socket, next) => {
    const token = tokenFromCookieHeader(socket.handshake.headers.cookie);
    if (!token) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const payload = app.jwt.verify(token) as { sub: string; role: string };
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const role = socket.data.role as string;
    let detach: (() => void) | null = null;

    // Returns the container id if the user can see this server (owner,
    // admin, or subuser — regardless of which permissions they hold).
    function resolveContainer(serverId: unknown): string | null {
      if (typeof serverId !== 'string') {
        return null;
      }
      const server = getServer(serverId);
      if (!server || !server.containerId) {
        return null;
      }
      const isOwner = server.ownerId === userId;
      const isAdmin = role === 'ADMIN';
      const isSubuser = !isOwner && !isAdmin && getSubuser(server.id, userId) !== null;
      if (!isOwner && !isAdmin && !isSubuser) {
        return null;
      }
      return server.containerId;
    }

    socket.on('console:subscribe', async (serverId: unknown) => {
      const containerId = resolveContainer(serverId);
      if (!containerId) {
        socket.emit('console:error', 'forbidden');
        return;
      }
      detach?.();
      detach = null;
      try {
        detach = await attachConsole(containerId, (text) => {
          socket.emit('console:output', text);
        });
      } catch {
        socket.emit('console:error', 'unavailable');
      }
    });

    socket.on('console:command', async (payload: CommandPayload) => {
      const containerId = resolveContainer(payload?.serverId);
      const command =
        typeof payload?.command === 'string' ? payload.command.trim() : '';
      if (!containerId || command.length === 0) {
        return;
      }
      // Sending commands requires the console.send permission. Owners
      // and admins implicitly have it via effectivePermissions.
      const server = getServer(payload.serverId as string);
      if (!server) return;
      const granted = effectivePermissions({
        serverId: server.id,
        userId,
        role,
        ownerId: server.ownerId,
      });
      if (!granted.includes(PERMISSION.CONSOLE_SEND)) {
        socket.emit('console:error', 'forbidden');
        return;
      }
      try {
        const output = await sendConsoleCommand(containerId, command);
        if (output.trim().length > 0) {
          socket.emit('console:output', output);
        }
      } catch {
        socket.emit('console:error', 'command-failed');
      }
    });

    // v0.21.0+: live container stats stream (CPU / memory / uptime).
    // One Docker stats stream per socket — multiplexing across sockets
    // could be added later if it becomes a load issue.
    let stopStats: (() => void) | null = null;
    socket.on('stats:subscribe', async (serverId: unknown) => {
      const containerId = resolveContainer(serverId);
      if (!containerId) {
        socket.emit('stats:error', 'forbidden');
        return;
      }
      stopStats?.();
      stopStats = null;
      try {
        stopStats = await streamContainerStats(
          containerId,
          (tick) => socket.emit('stats:tick', tick),
          () => socket.emit('stats:error', 'unavailable'),
        );
      } catch {
        socket.emit('stats:error', 'unavailable');
      }
    });

    socket.on('stats:unsubscribe', () => {
      stopStats?.();
      stopStats = null;
    });

    socket.on('disconnect', () => {
      detach?.();
      detach = null;
      stopStats?.();
      stopStats = null;
    });
  });
}
