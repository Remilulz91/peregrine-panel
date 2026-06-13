import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sanitizeRconReason, SanitizeError } from '../lib/sanitize';
import { authenticate } from '../plugins/auth';
import { accessibleServer, requirePermission } from '../lib/acl';
import { PERMISSION } from '../lib/permissions';
import { getTemplate } from '../lib/templates';
import { getContainerState, sendConsoleCommand } from '../lib/docker';
import { readRconPassword } from '../lib/properties';
import {
  readBannedIps,
  readBannedPlayers,
  readOps,
  readWhitelist,
} from '../lib/minecraftAdminFiles';
import { logActivity } from '../lib/activity';

/**
 * Whitelist / ops / ban management routes (v0.29.0+).
 *
 *   GET    /servers/:id/access/whitelist
 *   POST   /servers/:id/access/whitelist                  body: { name }
 *   DELETE /servers/:id/access/whitelist/:name
 *
 *   GET    /servers/:id/access/ops
 *   POST   /servers/:id/access/ops                        body: { name }
 *   DELETE /servers/:id/access/ops/:name
 *
 *   GET    /servers/:id/access/banned-players
 *   POST   /servers/:id/access/banned-players             body: { name, reason? }
 *   DELETE /servers/:id/access/banned-players/:name
 *
 *   GET    /servers/:id/access/banned-ips
 *   POST   /servers/:id/access/banned-ips                 body: { ip, reason? }
 *   DELETE /servers/:id/access/banned-ips/:ip
 *
 * All GETs read the JSON files directly and work whether the server
 * is running or not. All writes execute the corresponding RCON
 * command (`whitelist add`, `op`, `ban`, `pardon`, ...) so the
 * server itself resolves name → UUID via Mojang, updates the live
 * state, and writes the JSON file for us. The server must therefore
 * be RUNNING for modifications; the route returns 409 otherwise
 * with a clear message.
 *
 * Java-only. Bedrock returns 501.
 */

const NAME_PATTERN = '^[A-Za-z0-9_]{1,16}$';
const IP_PATTERN = '^[0-9A-Fa-f.:]{1,45}$';

interface RunningGuardOk {
  ok: true;
  password: string | undefined;
  containerId: string;
}

interface RunningGuardFail {
  ok: false;
}

/**
 * Verifies the server is currently running, since RCON only works
 * against a live container. Returns the container id and the RCON
 * password parsed from `server.properties` on success, or a 409 on
 * failure (and the caller should `return` immediately).
 */
async function requireRunning(
  request: FastifyRequest,
  reply: FastifyReply,
  serverId: string,
  containerId: string | null,
): Promise<RunningGuardOk | RunningGuardFail> {
  if (!containerId) {
    await reply
      .code(409)
      .send({ error: 'Server must be running to modify access lists.' });
    return { ok: false };
  }
  const state = await getContainerState(containerId);
  if (state !== 'running') {
    await reply
      .code(409)
      .send({ error: 'Server must be running to modify access lists.' });
    return { ok: false };
  }
  const password = readRconPassword(serverId) ?? undefined;
  return { ok: true, password, containerId };
}

export async function playerAccessRoutes(app: FastifyInstance): Promise<void> {
  // Shared preflight: load the server (404), ensure it's a Java template
  // (501 otherwise). Returns null when the handler should bail.
  async function loadJavaServer(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      await reply.code(404).send({ error: 'Server not found.' });
      return null;
    }
    const template = getTemplate(server.templateId);
    if (!template || template.kind !== 'java') {
      await reply.code(501).send({
        error: 'Access-control lists are only available for Minecraft Java servers.',
      });
      return null;
    }
    return server;
  }

  // ----- Whitelist -----

  app.get(
    '/servers/:id/access/whitelist',
    { preHandler: authenticate },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      return { entries: readWhitelist(server.id) };
    },
  );

  app.post(
    '/servers/:id/access/whitelist',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name: { type: 'string', pattern: NAME_PATTERN } },
        },
      },
    },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      if (!requirePermission(request, reply, server, PERMISSION.PLAYERS_MANAGE)) return;
      const guard = await requireRunning(request, reply, server.id, server.containerId);
      if (!guard.ok) return;
      const { name } = request.body as { name: string };
      const out = await sendConsoleCommand(guard.containerId, `whitelist add ${name}`, guard.password);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.whitelist_add',
        details: name,
      });
      return { ok: true, output: out };
    },
  );

  app.delete(
    '/servers/:id/access/whitelist/:name',
    { preHandler: authenticate },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      if (!requirePermission(request, reply, server, PERMISSION.PLAYERS_MANAGE)) return;
      const guard = await requireRunning(request, reply, server.id, server.containerId);
      if (!guard.ok) return;
      const { name } = request.params as { name: string };
      if (!new RegExp(NAME_PATTERN).test(name)) {
        return reply.code(400).send({ error: 'Invalid player name.' });
      }
      const out = await sendConsoleCommand(guard.containerId, `whitelist remove ${name}`, guard.password);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.whitelist_remove',
        details: name,
      });
      return { ok: true, output: out };
    },
  );

  // ----- Ops -----

  app.get(
    '/servers/:id/access/ops',
    { preHandler: authenticate },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      return { entries: readOps(server.id) };
    },
  );

  app.post(
    '/servers/:id/access/ops',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: { name: { type: 'string', pattern: NAME_PATTERN } },
        },
      },
    },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      if (!requirePermission(request, reply, server, PERMISSION.PLAYERS_MANAGE)) return;
      const guard = await requireRunning(request, reply, server.id, server.containerId);
      if (!guard.ok) return;
      const { name } = request.body as { name: string };
      const out = await sendConsoleCommand(guard.containerId, `op ${name}`, guard.password);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.op_add',
        details: name,
      });
      return { ok: true, output: out };
    },
  );

  app.delete(
    '/servers/:id/access/ops/:name',
    { preHandler: authenticate },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      if (!requirePermission(request, reply, server, PERMISSION.PLAYERS_MANAGE)) return;
      const guard = await requireRunning(request, reply, server.id, server.containerId);
      if (!guard.ok) return;
      const { name } = request.params as { name: string };
      if (!new RegExp(NAME_PATTERN).test(name)) {
        return reply.code(400).send({ error: 'Invalid player name.' });
      }
      const out = await sendConsoleCommand(guard.containerId, `deop ${name}`, guard.password);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.op_remove',
        details: name,
      });
      return { ok: true, output: out };
    },
  );

  // ----- Banned players -----

  app.get(
    '/servers/:id/access/banned-players',
    { preHandler: authenticate },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      return { entries: readBannedPlayers(server.id) };
    },
  );

  app.post(
    '/servers/:id/access/banned-players',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', pattern: NAME_PATTERN },
            reason: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      if (!requirePermission(request, reply, server, PERMISSION.PLAYERS_MANAGE)) return;
      const guard = await requireRunning(request, reply, server.id, server.containerId);
      if (!guard.ok) return;
      const { name, reason } = request.body as { name: string; reason?: string };
      const safeReason = (reason ?? '').replace(/[\n\r]/g, ' ').slice(0, 200);
      const command = safeReason ? `ban ${name} ${safeReason}` : `ban ${name}`;
      const out = await sendConsoleCommand(guard.containerId, command, guard.password);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.player_ban',
        details: safeReason ? `${name}: ${safeReason}` : name,
      });
      return { ok: true, output: out };
    },
  );

  app.delete(
    '/servers/:id/access/banned-players/:name',
    { preHandler: authenticate },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      if (!requirePermission(request, reply, server, PERMISSION.PLAYERS_MANAGE)) return;
      const guard = await requireRunning(request, reply, server.id, server.containerId);
      if (!guard.ok) return;
      const { name } = request.params as { name: string };
      if (!new RegExp(NAME_PATTERN).test(name)) {
        return reply.code(400).send({ error: 'Invalid player name.' });
      }
      const out = await sendConsoleCommand(guard.containerId, `pardon ${name}`, guard.password);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.player_pardon',
        details: name,
      });
      return { ok: true, output: out };
    },
  );

  // ----- Banned IPs -----

  app.get(
    '/servers/:id/access/banned-ips',
    { preHandler: authenticate },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      return { entries: readBannedIps(server.id) };
    },
  );

  app.post(
    '/servers/:id/access/banned-ips',
    {
      preHandler: authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['ip'],
          additionalProperties: false,
          properties: {
            ip: { type: 'string', pattern: IP_PATTERN },
            reason: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      if (!requirePermission(request, reply, server, PERMISSION.PLAYERS_MANAGE)) return;
      const guard = await requireRunning(request, reply, server.id, server.containerId);
      if (!guard.ok) return;
      const { ip, reason } = request.body as { ip: string; reason?: string };
      const safeReason = (reason ?? '').replace(/[\n\r]/g, ' ').slice(0, 200);
      const command = safeReason ? `ban-ip ${ip} ${safeReason}` : `ban-ip ${ip}`;
      const out = await sendConsoleCommand(guard.containerId, command, guard.password);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.ip_ban',
        details: safeReason ? `${ip}: ${safeReason}` : ip,
      });
      return { ok: true, output: out };
    },
  );

  app.delete(
    '/servers/:id/access/banned-ips/:ip',
    { preHandler: authenticate },
    async (request, reply) => {
      const server = await loadJavaServer(request, reply);
      if (!server) return;
      if (!requirePermission(request, reply, server, PERMISSION.PLAYERS_MANAGE)) return;
      const guard = await requireRunning(request, reply, server.id, server.containerId);
      if (!guard.ok) return;
      const { ip } = request.params as { ip: string };
      if (!new RegExp(IP_PATTERN).test(ip)) {
        return reply.code(400).send({ error: 'Invalid IP address.' });
      }
      const out = await sendConsoleCommand(guard.containerId, `pardon-ip ${ip}`, guard.password);
      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.ip_pardon',
        details: ip,
      });
      return { ok: true, output: out };
    },
  );
}
