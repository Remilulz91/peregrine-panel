import { randomUUID } from 'node:crypto';
import { db } from './db';

/** Supported Minecraft loader types (Java side). Bedrock is always 'vanilla'. */
export type ServerLoader = 'vanilla' | 'paper' | 'fabric' | 'forge';

const LOADER_SET: ReadonlySet<string> = new Set([
  'vanilla',
  'paper',
  'fabric',
  'forge',
]);

/** True if the given value is one of the supported loaders. */
export function isLoader(value: string): value is ServerLoader {
  return LOADER_SET.has(value);
}

/** A game server, as used inside the backend. */
export interface ServerRecord {
  id: string;
  ownerId: string;
  templateId: string;
  name: string;
  status: string;
  containerId: string | null;
  minecraftVersion: string;
  /** Loader passed as TYPE to the itzg image (vanilla / paper / fabric / forge). */
  loader: ServerLoader;
  memoryMb: number;
  cpuLimit: number;
  port: number;
  createdAt: string;
}

interface ServerRow {
  id: string;
  owner_id: string;
  template_id: string;
  name: string;
  status: string;
  container_id: string | null;
  minecraft_version: string;
  loader: string;
  memory_mb: number;
  cpu_limit: number;
  port: number;
  created_at: string;
}

function toRecord(row: ServerRow): ServerRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    templateId: row.template_id,
    name: row.name,
    status: row.status,
    containerId: row.container_id,
    minecraftVersion: row.minecraft_version,
    loader: isLoader(row.loader) ? row.loader : 'vanilla',
    memoryMb: row.memory_mb,
    cpuLimit: row.cpu_limit,
    port: row.port,
    createdAt: row.created_at,
  };
}

const PORT_RANGE_START = 25565;
const PORT_RANGE_END = 25664;

/** Picks the lowest port in the range that is not already used. */
export function allocatePort(): number {
  const rows = db.prepare('SELECT port FROM servers').all() as unknown as {
    port: number;
  }[];
  const used = new Set(rows.map((r) => r.port));
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!used.has(port)) {
      return port;
    }
  }
  throw new Error('No free port available.');
}

/** Creates a new game server row (initially with status INSTALLING). */
export function createServer(input: {
  ownerId: string;
  templateId: string;
  name: string;
  minecraftVersion: string;
  loader: ServerLoader;
  memoryMb: number;
  cpuLimit: number;
  port: number;
}): ServerRecord {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO servers
       (id, owner_id, template_id, name, minecraft_version, loader,
        memory_mb, cpu_limit, port)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.ownerId,
    input.templateId,
    input.name,
    input.minecraftVersion,
    input.loader,
    input.memoryMb,
    input.cpuLimit,
    input.port,
  );
  const created = getServer(id);
  if (!created) {
    throw new Error('Failed to create the server.');
  }
  return created;
}

/** Lists every server owned by a given user, newest first. */
export function listServersByOwner(ownerId: string): ServerRecord[] {
  const rows = db
    .prepare('SELECT * FROM servers WHERE owner_id = ? ORDER BY created_at DESC')
    .all(ownerId) as unknown as ServerRow[];
  return rows.map(toRecord);
}

/** Lists every server in the database, newest first (admin view). */
export function listAllServers(): ServerRecord[] {
  const rows = db
    .prepare('SELECT * FROM servers ORDER BY created_at DESC')
    .all() as unknown as ServerRow[];
  return rows.map(toRecord);
}

/** Lists every server visible to a user (owned + subuser shares). */
export function listServersVisibleTo(userId: string): ServerRecord[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT s.* FROM servers s
       LEFT JOIN server_subusers sub ON sub.server_id = s.id
       WHERE s.owner_id = ? OR sub.user_id = ?
       ORDER BY s.created_at DESC`,
    )
    .all(userId, userId) as unknown as ServerRow[];
  return rows.map(toRecord);
}

/** Finds a server by id, or returns null. */
export function getServer(id: string): ServerRecord | null {
  const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as
    | ServerRow
    | undefined;
  return row ? toRecord(row) : null;
}

/** Updates a server's status and (optionally) its Docker container id. */
export function updateServerStatus(
  id: string,
  status: string,
  containerId: string | null = null,
): void {
  if (containerId !== null) {
    db.prepare(
      'UPDATE servers SET status = ?, container_id = ? WHERE id = ?',
    ).run(status, containerId, id);
  } else {
    db.prepare('UPDATE servers SET status = ? WHERE id = ?').run(status, id);
  }
}

/** Renames a server (updates the human-readable name only). */
export function renameServer(id: string, name: string): void {
  db.prepare('UPDATE servers SET name = ? WHERE id = ?').run(name, id);
}

/** Updates the RAM and CPU limits stored for a server. */
export function updateServerResources(
  id: string,
  memoryMb: number,
  cpuLimit: number,
): void {
  db.prepare(
    'UPDATE servers SET memory_mb = ?, cpu_limit = ? WHERE id = ?',
  ).run(memoryMb, cpuLimit, id);
}

/** Removes a server row from the database. */
export function deleteServer(id: string): void {
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
}
