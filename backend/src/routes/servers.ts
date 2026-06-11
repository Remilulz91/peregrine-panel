import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { getTemplate, listTemplates } from '../lib/templates';
import {
  allocatePort,
  createServer,
  deleteServer,
  getServer,
  isLoader,
  listServersVisibleTo,
  renameServer,
  updateServerDescription,
  updateServerDiskQuota,
  updateServerResources,
  type ServerLoader,
  type ServerRecord,
} from '../lib/servers';
import {
  assertEnoughHostResources,
  HostResourcesError,
} from '../lib/host';
import { validateVersion } from '../lib/minecraftVersions';
import { hasIcon, iconUpdatedAt } from '../lib/icons';
import { findUserById } from '../lib/users';
import { effectivePermissions } from '../lib/subusers';
import { PERMISSION } from '../lib/permissions';
import {
  accessibleServer,
  requireOwner,
  requirePermission,
} from '../lib/acl';
import {
  getContainerState,
  restartContainer,
  startContainer,
  stopContainer,
  updateContainerResources,
} from '../lib/docker';
import { deprovisionServer, provisionServer } from '../services/provisioning';
import { listActivityForServer, logActivity } from '../lib/activity';
import { assertEnoughFreeSpace, DiskFullError } from '../lib/disk';
import { deleteAllBackupsForServer } from '../services/backups';
import { config } from '../config';

interface CreateServerBody {
  name: string;
  templateId: string;
  minecraftVersion?: string;
  /** Optional — server flavour for Java (vanilla / paper / fabric / forge). */
  loader?: string;
  /** Optional free-text description shown under the server name. */
  description?: string;
  /**
   * Optional account id that should own the new server. Defaults to
   * the admin creating it. Only admins can call this route at all,
   * so there's no privilege-escalation risk in trusting the value.
   */
  ownerId?: string;
  /**
   * When true, the server is automatically started right after the
   * install completes. Defaults to true — matches the Pterodactyl UX.
   */
  autostart?: boolean;
  /** Optional disk quota in MiB. 0 / omitted = no quota (unlimited). */
  diskQuotaMb?: number;
  memoryMb: number;
  cpuLimit: number;
}

interface RenameServerBody {
  name?: string;
  description?: string;
  memoryMb?: number;
  cpuLimit?: number;
  /** Disk quota in MiB. 0 means "remove the quota" (unlimited). */
  diskQuotaMb?: number;
}

async function effectiveStatus(server: ServerRecord): Promise<string> {
  if (server.status === 'INSTALLING' || server.status === 'INSTALL_FAILED') {
    return server.status;
  }
  if (!server.containerId) {
    return 'OFFLINE';
  }
  const state = await getContainerState(server.containerId);
  return state === 'running' ? 'RUNNING' : 'OFFLINE';
}

/**
 * Shapes a server for the API response, from the perspective of a given
 * viewer. Includes the owner's username plus `isOwner` and the loader
 * so the dashboard can tag rows correctly.
 */
async function publicServer(server: ServerRecord, viewerId: string) {
  const owner = findUserById(server.ownerId);
  return {
    id: server.id,
    name: server.name,
    status: await effectiveStatus(server),
    templateId: server.templateId,
    minecraftVersion: server.minecraftVersion,
    loader: server.loader,
    description: server.description,
    hasIcon: hasIcon(server.id),
    iconUpdatedAt: iconUpdatedAt(server.id),
    diskQuotaMb: server.diskQuotaMb,
    diskUsedMb: server.diskUsedMb,
    memoryMb: server.memoryMb,
    cpuLimit: server.cpuLimit,
    port: server.port,
    createdAt: server.createdAt,
    isOwner: server.ownerId === viewerId,
    ownerUsername: owner?.username ?? '?',
  };
}

export async function serverRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);

  app.get('/templates', async () => {
    return { templates: listTemplates() };
  });

  app.get('/servers', async (request) => {
    const servers = listServersVisibleTo(request.user.sub);
    const result = await Promise.all(
      servers.map((s) => publicServer(s, request.user.sub)),
    );
    return { servers: result };
  });

  app.get('/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    const myPermissions = effectivePermissions({
      serverId: server.id,
      userId: request.user.sub,
      role: request.user.role,
      ownerId: server.ownerId,
    });
    return {
      server: await publicServer(server, request.user.sub),
      myPermissions,
    };
  });

  app.post(
    '/servers',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'templateId', 'memoryMb', 'cpuLimit'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 48 },
            description: { type: 'string', maxLength: 200 },
            templateId: { type: 'string', minLength: 1 },
            minecraftVersion: { type: 'string', maxLength: 32 },
            loader: {
              type: 'string',
              enum: ['vanilla', 'paper', 'fabric', 'forge', 'neoforge'],
            },
            ownerId: { type: 'string', minLength: 1 },
            autostart: { type: 'boolean' },
            diskQuotaMb: { type: 'integer', minimum: 0, maximum: 1048576 },
            memoryMb: { type: 'integer', minimum: 512, maximum: 524288 },
            cpuLimit: { type: 'number', minimum: 0.5, maximum: 256 },
          },
        },
      },
    },
    async (request, reply) => {
      // Server creation is administrator-only. Owners and subusers can
      // still manage existing servers (start/stop, console, files, ...)
      // but cannot create new ones — that's the hosting-panel model
      // adopted in v0.12.0.
      if (request.user.role !== 'ADMIN') {
        return reply
          .code(403)
          .send({ error: 'Only administrators can create servers.' });
      }

      const body = request.body as CreateServerBody;

      const template = getTemplate(body.templateId);
      if (!template) {
        return reply.code(400).send({ error: 'Unknown game template.' });
      }

      // ownerId defaults to the calling admin. When provided, the
      // chosen user must exist — otherwise reject with a clear 400.
      let ownerId = request.user.sub;
      if (typeof body.ownerId === 'string' && body.ownerId.length > 0) {
        const target = findUserById(body.ownerId);
        if (!target) {
          return reply.code(400).send({ error: 'Unknown owner account.' });
        }
        ownerId = target.id;
      }

      // v0.19.1+: validate the typed Minecraft version BEFORE we hit the
      // disk / host preflights, so a typo in the version field doesn't
      // get masked by a "not enough RAM" message. The validator only
      // depends on the template kind (java vs bedrock), so we can run
      // it ahead of loader normalisation. An empty version means "use
      // the template default" — that's always trusted, so we skip.
      const typedVersion = body.minecraftVersion?.trim();
      const effectiveVersion = typedVersion || template.defaultVersion;
      if (typedVersion) {
        const versionResult = await validateVersion({
          kind: template.kind,
          loader: 'vanilla',
          version: typedVersion,
        });
        if (!versionResult.ok) {
          return reply.code(400).send({
            error: versionResult.message,
            field: 'minecraftVersion',
            code: versionResult.code,
            data: versionResult.data,
          });
        }
      }

      try {
        await assertEnoughFreeSpace(config.serversPath, 2 * 1024 * 1024 * 1024);
      } catch (err) {
        if (err instanceof DiskFullError) {
          return reply.code(507).send({
            error:
              'Not enough free disk space to create a new server. ' +
              'Delete unused servers or backups and try again.',
          });
        }
        throw err;
      }

      // Refuse the create if RAM or CPU would push the host past its
      // safety margin (1 GiB RAM + 1 core reserved for the OS / panel).
      try {
        assertEnoughHostResources({
          memoryMb: body.memoryMb,
          cpuLimit: body.cpuLimit,
        });
      } catch (err) {
        if (err instanceof HostResourcesError) {
          return reply.code(507).send({
            error:
              'Not enough free RAM or CPU on the host machine for this allocation.',
            resources: err.resources,
          });
        }
        throw err;
      }

      let port: number;
      try {
        port = allocatePort();
      } catch {
        return reply
          .code(409)
          .send({ error: 'No free port available on this machine.' });
      }

      // Loader normalisation: Bedrock is always vanilla (no loader concept
      // exists for it), Java defaults to vanilla if none was specified.
      let loader: ServerLoader = 'vanilla';
      if (template.kind === 'java' && body.loader && isLoader(body.loader)) {
        loader = body.loader;
      }

      // Normalise the quota: 0 / undefined => null = no quota.
      const diskQuotaMb =
        typeof body.diskQuotaMb === 'number' && body.diskQuotaMb > 0
          ? body.diskQuotaMb
          : null;

      const server = createServer({
        ownerId,
        templateId: template.id,
        name: body.name,
        description: (body.description ?? '').trim(),
        minecraftVersion: effectiveVersion,
        loader,
        memoryMb: body.memoryMb,
        cpuLimit: body.cpuLimit,
        diskQuotaMb,
        port,
      });

      logActivity({
        serverId: server.id,
        actorId: request.user.sub,
        kind: 'server.create',
      });

      // autostart defaults to true — matches the Pterodactyl UX of
      // "Start Server when Installed" being on by default.
      const autostart = body.autostart !== false;
      void provisionServer(server, template, { autostart });

      return reply
        .code(201)
        .send({ server: await publicServer(server, request.user.sub) });
    },
  );

  app.patch(
    '/servers/:id',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 48 },
            description: { type: 'string', maxLength: 200 },
            diskQuotaMb: { type: 'integer', minimum: 0, maximum: 1048576 },
            memoryMb: { type: 'integer', minimum: 512, maximum: 65536 },
            cpuLimit: { type: 'number', minimum: 0.5, maximum: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) {
        return reply.code(404).send({ error: 'Server not found.' });
      }
      const body = request.body as RenameServerBody;
      const wantsRename =
        typeof body.name === 'string' && body.name.trim() !== server.name;
      const wantsDescription =
        typeof body.description === 'string' &&
        body.description.trim() !== server.description;
      const wantsResize =
        typeof body.memoryMb === 'number' || typeof body.cpuLimit === 'number';
      const wantsQuota = typeof body.diskQuotaMb === 'number';

      if (!wantsRename && !wantsDescription && !wantsResize && !wantsQuota) {
        // Nothing to change — return current state, no permission check.
        const current = getServer(server.id);
        return {
          server: current && (await publicServer(current, request.user.sub)),
        };
      }

      if (wantsDescription) {
        // The description shares the settings.rename permission since
        // both are cosmetic, owner-managed metadata.
        if (
          !requirePermission(
            request,
            reply,
            server,
            PERMISSION.SETTINGS_RENAME,
          )
        ) {
          return;
        }
        const newDescription = (body.description ?? '').trim();
        updateServerDescription(server.id, newDescription);
        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'server.describe',
          details: newDescription.length > 0 ? newDescription.slice(0, 100) : '(cleared)',
        });
      }

      if (wantsRename) {
        if (
          !requirePermission(
            request,
            reply,
            server,
            PERMISSION.SETTINGS_RENAME,
          )
        ) {
          return;
        }
        const newName = (body.name ?? '').trim();
        if (newName.length === 0) {
          return reply.code(400).send({ error: 'Name cannot be empty.' });
        }
        renameServer(server.id, newName);
        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'server.rename',
          details: `${server.name} → ${newName}`,
        });
      }

      if (wantsResize) {
        // Resizing changes host-level resource allocation, so we
        // reserve it for the owner (and admins, via accessibleServer).
        if (!requireOwner(request, reply, server)) return;

        // The server must be stopped to avoid live-changing the JVM
        // heap mid-run, which would mostly be ignored anyway.
        if (server.containerId) {
          const state = await getContainerState(server.containerId);
          if (state === 'running') {
            return reply.code(409).send({
              error: 'Stop the server before changing its resources.',
            });
          }
        }

        const newMemMb = body.memoryMb ?? server.memoryMb;
        const newCpu = body.cpuLimit ?? server.cpuLimit;

        try {
          assertEnoughHostResources({
            memoryMb: newMemMb,
            cpuLimit: newCpu,
            excludeServerId: server.id,
          });
        } catch (err) {
          if (err instanceof HostResourcesError) {
            return reply.code(507).send({
              error:
                'Not enough free RAM or CPU on the host machine for this allocation.',
              resources: err.resources,
            });
          }
          throw err;
        }

        updateServerResources(server.id, newMemMb, newCpu);

        if (server.containerId) {
          try {
            await updateContainerResources(
              server.containerId,
              newMemMb,
              newCpu,
            );
          } catch (err) {
            // The DB is updated already; Docker can be re-aligned on
            // next start. Log so we know if a host is misbehaving.
            // eslint-disable-next-line no-console
            console.warn(
              `[servers] Docker update failed for ${server.id}:`,
              err,
            );
          }
        }

        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'server.resize',
          details: `mem ${server.memoryMb}→${newMemMb} MiB, cpu ${server.cpuLimit}→${newCpu}`,
        });
      }

      if (wantsQuota) {
        // Disk quota changes the resource allocation, so it's admin-only,
        // just like rename of memory/CPU limits.
        if (request.user.role !== 'ADMIN') {
          return reply.code(403).send({
            error: 'Only administrators can change the disk quota.',
          });
        }
        // 0 = remove the quota (unlimited).
        const newQuota =
          (body.diskQuotaMb ?? 0) > 0 ? (body.diskQuotaMb as number) : null;
        updateServerDiskQuota(server.id, newQuota);
        logActivity({
          serverId: server.id,
          actorId: request.user.sub,
          kind: 'server.quota',
          details:
            newQuota === null
              ? '(unlimited)'
              : `${server.diskQuotaMb ?? 'unlimited'} → ${newQuota} MiB`,
        });
      }

      const updated = getServer(server.id);
      return {
        server: updated && (await publicServer(updated, request.user.sub)),
      };
    },
  );

  app.delete('/servers/:id', async (request, reply) => {
    // Deleting a server is administrator-only (v0.12.0+). Owners
    // can still manage everything else (rename, resize, start/stop,
    // backups, ...) but the destructive remove action is gated to
    // admins to avoid accidental data loss by end users.
    if (request.user.role !== 'ADMIN') {
      return reply
        .code(403)
        .send({ error: 'Only administrators can delete servers.' });
    }
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    if (server.containerId) {
      const state = await getContainerState(server.containerId);
      if (state === 'running') {
        return reply.code(409).send({
          error: 'Stop the server before deleting it.',
        });
      }
    }
    logActivity({
      serverId: server.id,
      actorId: request.user.sub,
      kind: 'server.delete',
      details: server.name,
    });
    await deprovisionServer(server);
    deleteAllBackupsForServer(server.id);
    deleteServer(server.id);
    return { ok: true };
  });

  app.post('/servers/:id/start', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    if (!requirePermission(request, reply, server, PERMISSION.CONTROL_START)) return;
    if (!server.containerId) {
      return reply.code(409).send({ error: 'Server is not ready yet.' });
    }
    // v0.15.0+: refuse to start a server that is already over its
    // disk quota — make some room (delete world, clear logs, ...) or
    // raise the quota first.
    if (
      server.diskQuotaMb !== null &&
      server.diskUsedMb > server.diskQuotaMb
    ) {
      return reply.code(409).send({
        error:
          'Disk quota exceeded. Free up space or raise the quota before starting the server.',
        diskUsedMb: server.diskUsedMb,
        diskQuotaMb: server.diskQuotaMb,
      });
    }
    try {
      await startContainer(server.containerId);
    } catch {
      return reply.code(502).send({ error: 'Could not start the server.' });
    }
    logActivity({
      serverId: server.id,
      actorId: request.user.sub,
      kind: 'server.start',
    });
    return { ok: true };
  });

  app.post('/servers/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    if (!requirePermission(request, reply, server, PERMISSION.CONTROL_STOP)) return;
    if (!server.containerId) {
      return reply.code(409).send({ error: 'Server is not ready yet.' });
    }
    try {
      await stopContainer(server.containerId);
    } catch {
      return reply.code(502).send({ error: 'Could not stop the server.' });
    }
    logActivity({
      serverId: server.id,
      actorId: request.user.sub,
      kind: 'server.stop',
    });
    return { ok: true };
  });

  app.post('/servers/:id/restart', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    if (!requirePermission(request, reply, server, PERMISSION.CONTROL_RESTART)) return;
    if (!server.containerId) {
      return reply.code(409).send({ error: 'Server is not ready yet.' });
    }
    try {
      await restartContainer(server.containerId);
    } catch {
      return reply.code(502).send({ error: 'Could not restart the server.' });
    }
    logActivity({
      serverId: server.id,
      actorId: request.user.sub,
      kind: 'server.restart',
    });
    return { ok: true };
  });

  app.get('/servers/:id/activity', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = accessibleServer(request, id);
    if (!server) {
      return reply.code(404).send({ error: 'Server not found.' });
    }
    return { entries: listActivityForServer(server.id, 100) };
  });
}
