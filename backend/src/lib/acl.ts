import type { FastifyReply, FastifyRequest } from 'fastify';
import { getServer, type ServerRecord } from './servers';
import { effectivePermissions, getSubuser } from './subusers';
import type { Permission } from './permissions';

/**
 * Returns the server only if the requesting user is allowed to *see* it.
 * "Seeing" is the precondition for any action — individual permissions
 * are checked separately via `requirePermission` below.
 *
 * Admins and the owner see everything. A subuser sees the server as long
 * as a row exists in `server_subusers`, regardless of which permissions
 * it grants.
 */
export function accessibleServer(
  request: FastifyRequest,
  id: string,
): ServerRecord | null {
  const server = getServer(id);
  if (!server) return null;
  if (request.user.role === 'ADMIN' || server.ownerId === request.user.sub) {
    return server;
  }
  if (getSubuser(server.id, request.user.sub) !== null) {
    return server;
  }
  return null;
}

/**
 * Gate helper: checks that the request has the given permission on the
 * server, and sends a 403 if not. Returns `true` when the action may
 * proceed, `false` (and replies) otherwise. Owners and admins always
 * pass.
 */
export function requirePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  server: ServerRecord,
  permission: Permission,
): boolean {
  const granted = effectivePermissions({
    serverId: server.id,
    userId: request.user.sub,
    role: request.user.role,
    ownerId: server.ownerId,
  });
  if (granted.includes(permission)) return true;
  reply.code(403).send({
    error: 'You do not have permission to perform this action.',
  });
  return false;
}

/**
 * Gate helper: refuse the action unless the request comes from the
 * server's owner (or an administrator). Used for deletion and subuser
 * management — actions that cannot be delegated.
 */
export function requireOwner(
  request: FastifyRequest,
  reply: FastifyReply,
  server: ServerRecord,
): boolean {
  if (
    request.user.role === 'ADMIN' ||
    server.ownerId === request.user.sub
  ) {
    return true;
  }
  reply.code(403).send({ error: 'Only the owner can perform this action.' });
  return false;
}
