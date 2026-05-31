import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth';
import { accessibleServer } from '../lib/acl';
import { getServer } from '../lib/servers';
import { getTemplate } from '../lib/templates';
import { getContainerState, sendConsoleCommand } from '../lib/docker';

/** Snapshot of the players online on a server. */
interface PlayerListResponse {
  /** True when the server backend supports the query (Java only for now). */
  supported: boolean;
  /** True when the server is running and could be queried. */
  running: boolean;
  /** Number of connected players. */
  online: number;
  /** Server's player slot count, as configured in server.properties. */
  max: number;
  /** Usernames of currently connected players. */
  players: string[];
}

/**
 * Parses the textual output of the Minecraft `list` RCON command.
 * Expected formats on vanilla / Paper / Fabric / Forge:
 *
 *   "There are 2 of a max of 20 players online: alice, bob"
 *   "There are 0 of a max of 20 players online:"
 *   "There are 2 of a max 20 players online: alice, bob"  (older Paper)
 *
 * Anything else — including RCON connection errors during boot
 * (e.g. "Failed to connect to RCON server" while MC is still
 * starting up) — is treated as "no data yet" rather than parsed
 * lossily, otherwise stray digits in error messages end up shown as
 * online / max counters on the dashboard.
 */
function parseListOutput(output: string): {
  online: number;
  max: number;
  players: string[];
} {
  // Fast path: RCON not ready yet (typical during the first ~30s
  // of the server boot). The itzg image's rcon-cli prints a line
  // like "2026/05/30 20:32 Failed to connect to RCON serverdial
  // tcp [::1]:25575: connect: connection refused" in that case.
  if (
    /failed to connect to rcon|connection refused|unable to connect|no such host/i.test(
      output,
    )
  ) {
    return { online: 0, max: 0, players: [] };
  }

  // Strict match — require the actual phrasing the Minecraft list
  // command outputs. The "of a max( of)? " group covers both modern
  // vanilla and older Paper wording.
  const match = output.match(
    /There are (\d+) of a max(?: of)? (\d+) players online:?\s*(.*)$/im,
  );
  if (!match) {
    return { online: 0, max: 0, players: [] };
  }

  const online = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);
  const rest = match[3].trim();
  const players =
    rest.length === 0
      ? []
      : rest
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
  return { online, max, players };
}

/**
 * Per-server player list endpoint.
 *
 * Runs the `list` RCON command and returns a JSON snapshot. The frontend
 * polls this every 30 seconds while the Console tab is open.
 *
 * Bedrock servers don't expose RCON in itzg's image, so we return
 * `supported: false` and the UI hides the panel for them.
 *
 * Available at: GET /api/servers/:id/players
 */
export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/servers/:id/players',
    { preHandler: authenticate },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const server = accessibleServer(request, id);
      if (!server) {
        return reply.code(404).send({ error: 'Server not found.' });
      }

      const template = getTemplate(server.templateId);
      const supported = template?.kind === 'java';
      if (!supported) {
        const empty: PlayerListResponse = {
          supported: false,
          running: false,
          online: 0,
          max: 0,
          players: [],
        };
        return empty;
      }

      // Only meaningful when the container is actually up — RCON
      // commands hang otherwise. Use the same containerState check
      // as the rest of the panel.
      if (!server.containerId) {
        const empty: PlayerListResponse = {
          supported: true,
          running: false,
          online: 0,
          max: 0,
          players: [],
        };
        return empty;
      }
      const state = await getContainerState(server.containerId);
      if (state !== 'running') {
        const empty: PlayerListResponse = {
          supported: true,
          running: false,
          online: 0,
          max: 0,
          players: [],
        };
        return empty;
      }

      try {
        const output = await sendConsoleCommand(server.containerId, 'list');
        // Re-read the server in case the worker just bumped diskUsedMb
        // — keeps the response consistent if the client re-orders calls.
        const fresh = getServer(server.id) ?? server;
        void fresh;
        const parsed = parseListOutput(output);
        const response: PlayerListResponse = {
          supported: true,
          running: true,
          ...parsed,
        };
        return response;
      } catch {
        // RCON might be unreachable during boot — return zero state.
        const fallback: PlayerListResponse = {
          supported: true,
          running: true,
          online: 0,
          max: 0,
          players: [],
        };
        return fallback;
      }
    },
  );
}
