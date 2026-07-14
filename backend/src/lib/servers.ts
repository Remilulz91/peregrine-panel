import { randomUUID } from 'node:crypto';
import { db } from './db';

/**
 * Supported Minecraft loader types (Java side). Bedrock is always 'vanilla'.
 *
 * v0.24.0+: NeoForge is the community fork of Forge maintained since
 * late 2023; the itzg image accepts it via `TYPE=NEOFORGE`.
 *
 * v0.41.0+: Bukkit and Spigot are the legacy plugin-API server flavours
 * — Spigot is the most popular Bukkit fork, Paper (already supported)
 * is a fork of Spigot. Both are accepted by the itzg image via
 * `TYPE=BUKKIT` / `TYPE=SPIGOT`, **but** they cannot be distributed as
 * binaries (DMCA — Mojang owns CraftBukkit). The itzg entrypoint runs
 * BuildTools.jar on first start to compile the server locally from
 * Mojang's mappings; expect 5–15 minutes of CPU + ~1–2 GiB of RAM
 * during that initial compile. Subsequent restarts reuse the compiled
 * jar and are as fast as Vanilla.
 */
export type ServerLoader =
  | 'vanilla'
  | 'paper'
  | 'fabric'
  | 'forge'
  | 'neoforge'
  | 'bukkit'
  | 'spigot'
  // v0.42.0+: high-value Paper-family and hybrid forks the itzg image
  // ships out of the box. See its types-and-platforms docs.
  | 'purpur'
  | 'folia'
  | 'quilt'
  | 'mohist'
  // v0.43.0+: the two actively-maintained Bukkit-API-on-top-of-a-mod-
  // loader hybrids. Arclight runs Forge AND NeoForge mods alongside
  // Bukkit/Spigot plugins; Banner runs Fabric mods alongside Bukkit
  // plugins. Together with the v0.42.0 Mohist entry, they cover the
  // three "mods + plugins" pairings the community actually maintains.
  | 'arclight'
  | 'banner';

const LOADER_SET: ReadonlySet<string> = new Set([
  'vanilla',
  'paper',
  'fabric',
  'forge',
  'neoforge',
  'bukkit',
  'spigot',
  'purpur',
  'folia',
  'quilt',
  'mohist',
  'arclight',
  'banner',
]);

/** True if the given value is one of the supported loaders. */
export function isLoader(value: string): value is ServerLoader {
  return LOADER_SET.has(value);
}

/**
 * v0.44.0+: which JVM version the panel asks itzg to boot the server
 * with.
 *
 * - 'auto' -> use itzg's default (:latest) which auto-picks a JVM
 *   from the requested Minecraft version. Right choice for the vast
 *   majority of new servers.
 * - 'java8' -> force Java 8. Needed for older Forge mod packs
 *   (1.7.10 - 1.12.2) that break on newer JVMs.
 * - 'java17' -> force Java 17. Needed for MC 1.17 - 1.20.4 when
 *   the auto-picker guesses wrong, or for some Fabric packs.
 * - 'java21' -> force Java 21. Needed for MC 1.20.5+ mod packs
 *   that require the newer bytecode features.
 */
export type JavaVersion = 'auto' | 'java8' | 'java17' | 'java21';

const JAVA_VERSION_SET: ReadonlySet<string> = new Set([
  'auto',
  'java8',
  'java17',
  'java21',
]);

/** True if the given value is one of the supported Java versions. */
export function isJavaVersion(value: string): value is JavaVersion {
  return JAVA_VERSION_SET.has(value);
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
  /**
   * v0.44.0+: which JVM to boot the container with. See JavaVersion.
   * Ignored for Bedrock servers (Bedrock has no Java).
   */
  javaVersion: JavaVersion;
  /** Free-text description shown under the name. Empty string = none. */
  description: string;
  memoryMb: number;
  cpuLimit: number;
  /** Optional disk quota in MiB. NULL = no quota enforcement. */
  diskQuotaMb: number | null;
  /**
   * Current disk usage in MiB, refreshed by the diskQuotaWorker tick.
   * 0 until the first measurement lands (just after server creation).
   */
  diskUsedMb: number;
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
  java_version: string;
  description: string | null;
  memory_mb: number;
  cpu_limit: number;
  disk_quota_mb: number | null;
  disk_used_mb: number;
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
    javaVersion: isJavaVersion(row.java_version) ? row.java_version : 'auto',
    description: row.description ?? '',
    memoryMb: row.memory_mb,
    cpuLimit: row.cpu_limit,
    diskQuotaMb: row.disk_quota_mb,
    diskUsedMb: row.disk_used_mb ?? 0,
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
  description: string;
  minecraftVersion: string;
  loader: ServerLoader;
  /** v0.44.0+: 'auto' by default. Only meaningful for Java servers. */
  javaVersion: JavaVersion;
  memoryMb: number;
  cpuLimit: number;
  diskQuotaMb: number | null;
  port: number;
}): ServerRecord {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO servers
       (id, owner_id, template_id, name, description, minecraft_version,
        loader, java_version, memory_mb, cpu_limit, disk_quota_mb, port)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.ownerId,
    input.templateId,
    input.name,
    input.description || null,
    input.minecraftVersion,
    input.loader,
    input.javaVersion,
    input.memoryMb,
    input.cpuLimit,
    input.diskQuotaMb,
    input.port,
  );
  const created = getServer(id);
  if (!created) {
    throw new Error('Failed to create the server.');
  }
  return created;
}

/**
 * v0.44.0+: updates the Java version pin for an existing server. Like
 * updateServerVersion, the caller is expected to destroy + recreate
 * the container around this DB update so the new image tag actually
 * takes effect on the next start.
 */
export function updateServerJavaVersion(
  id: string,
  javaVersion: JavaVersion,
): void {
  db.prepare('UPDATE servers SET java_version = ? WHERE id = ?').run(
    javaVersion,
    id,
  );
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

/** Updates the free-text description (empty string clears it). */
export function updateServerDescription(id: string, description: string): void {
  db.prepare('UPDATE servers SET description = ? WHERE id = ?').run(
    description.length > 0 ? description : null,
    id,
  );
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

/**
 * v0.31.0+: updates the Minecraft version and loader for an existing
 * server. Used by the PATCH route when the user changes the version
 * via the Settings tab; the container itself is destroyed and
 * recreated by the caller before/after this DB update so its env
 * vars (VERSION, TYPE) actually pick up the new values.
 */
export function updateServerVersion(
  id: string,
  minecraftVersion: string,
  loader: ServerLoader,
): void {
  db.prepare(
    'UPDATE servers SET minecraft_version = ?, loader = ? WHERE id = ?',
  ).run(minecraftVersion, loader, id);
}

/**
 * v0.31.0+: replaces the container id stored for a server. Used after
 * recreating the container (e.g. when the user changes the version).
 * Pass `null` to clear it (e.g. when the container has been removed
 * but not yet re-created).
 */
export function setServerContainerId(
  id: string,
  containerId: string | null,
): void {
  db.prepare('UPDATE servers SET container_id = ? WHERE id = ?').run(
    containerId,
    id,
  );
}

/** Updates the disk quota (NULL = unlimited). */
export function updateServerDiskQuota(
  id: string,
  diskQuotaMb: number | null,
): void {
  db.prepare('UPDATE servers SET disk_quota_mb = ? WHERE id = ?').run(
    diskQuotaMb,
    id,
  );
}

/** Updates the measured disk usage (called by the disk worker). */
export function updateServerDiskUsed(id: string, diskUsedMb: number): void {
  db.prepare('UPDATE servers SET disk_used_mb = ? WHERE id = ?').run(
    diskUsedMb,
    id,
  );
}

/** Removes a server row from the database. */
export function deleteServer(id: string): void {
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
}
