import fs from 'node:fs';
import os from 'node:os';
import { config } from '../config';
import { getDiskUsage, type DiskUsage } from './disk';
import { listAllServers } from './servers';

/**
 * Snapshot of the host's CPU and RAM, plus how much is already
 * promised to existing game servers and how much is still available
 * for a new (or resized) one. All RAM values are in mebibytes (MiB).
 */
export interface HostResources {
  /** Total physical RAM of the machine, in MiB. */
  totalMemMb: number;
  /** Total CPU cores on the machine. */
  totalCpus: number;
  /** RAM kept untouched as a safety margin for Peregrine + Docker + OS. */
  reservedMemMb: number;
  /** CPU cores kept untouched as a safety margin. */
  reservedCpus: number;
  /** Sum of the RAM limits of every existing server, in MiB. */
  allocatedMemMb: number;
  /** Sum of the CPU limits of every existing server. */
  allocatedCpus: number;
  /** RAM available for a new allocation, in MiB. */
  allocatableMemMb: number;
  /** CPU cores available for a new allocation. */
  allocatableCpus: number;
}

/**
 * Safety margin kept untouched on the host so the panel itself,
 * Docker, and the OS always have room to breathe. Mirrors the disk
 * reserve concept in lib/disk.ts. Configurable via the
 * RESERVED_MEM_MB and RESERVED_CPUS env vars — lower the defaults on
 * small VPS where the 1 GiB / 1 core reserve eats too much of the
 * host.
 */
const RESERVED_MEM_MB = config.reservedMemMb;
const RESERVED_CPUS = config.reservedCpus;

/** Returns the host's CPU/RAM and how much is left to allocate. */
export function getHostResources(): HostResources {
  // os.totalmem() returns bytes; convert to MiB.
  const totalMemMb = Math.floor(os.totalmem() / (1024 * 1024));
  const totalCpus = os.cpus().length;

  const servers = listAllServers();
  const allocatedMemMb = servers.reduce((sum, s) => sum + s.memoryMb, 0);
  const allocatedCpus = servers.reduce((sum, s) => sum + s.cpuLimit, 0);

  const allocatableMemMb = Math.max(
    0,
    totalMemMb - RESERVED_MEM_MB - allocatedMemMb,
  );
  const allocatableCpus = Math.max(
    0,
    totalCpus - RESERVED_CPUS - allocatedCpus,
  );

  return {
    totalMemMb,
    totalCpus,
    reservedMemMb: RESERVED_MEM_MB,
    reservedCpus: RESERVED_CPUS,
    allocatedMemMb,
    allocatedCpus,
    allocatableMemMb,
    allocatableCpus,
  };
}

/**
 * Raised when a create/resize request would push the host past its
 * safety margin. The route handlers turn this into HTTP 507 with a
 * clear message, mirroring how DiskFullError is handled.
 */
export class HostResourcesError extends Error {
  readonly resources: HostResources;
  readonly requestedMemMb: number;
  readonly requestedCpus: number;

  constructor(
    resources: HostResources,
    requestedMemMb: number,
    requestedCpus: number,
  ) {
    super('Not enough free host resources.');
    this.name = 'HostResourcesError';
    this.resources = resources;
    this.requestedMemMb = requestedMemMb;
    this.requestedCpus = requestedCpus;
  }
}

/**
 * Throws HostResourcesError if allocating the given RAM / CPU to a new
 * server (or to an existing one in addition to what it already owns)
 * would push the host past the safety margin.
 *
 * When resizing, pass `excludeServerId` so the caller's current
 * allocation is subtracted from the "already allocated" total before
 * the check.
 */
export function assertEnoughHostResources(input: {
  memoryMb: number;
  cpuLimit: number;
  excludeServerId?: string;
}): void {
  const { memoryMb, cpuLimit, excludeServerId } = input;
  const totalMemMb = Math.floor(os.totalmem() / (1024 * 1024));
  const totalCpus = os.cpus().length;

  const servers = listAllServers();
  let allocatedMemMb = 0;
  let allocatedCpus = 0;
  for (const s of servers) {
    if (s.id === excludeServerId) continue;
    allocatedMemMb += s.memoryMb;
    allocatedCpus += s.cpuLimit;
  }

  const memCeiling = totalMemMb - RESERVED_MEM_MB - allocatedMemMb;
  const cpuCeiling = totalCpus - RESERVED_CPUS - allocatedCpus;

  if (memoryMb > memCeiling || cpuLimit > cpuCeiling) {
    const resources: HostResources = {
      totalMemMb,
      totalCpus,
      reservedMemMb: RESERVED_MEM_MB,
      reservedCpus: RESERVED_CPUS,
      allocatedMemMb,
      allocatedCpus,
      allocatableMemMb: Math.max(0, memCeiling),
      allocatableCpus: Math.max(0, cpuCeiling),
    };
    throw new HostResourcesError(resources, memoryMb, cpuLimit);
  }
}

/**
 * Live host metrics (v0.28.0+). Unlike `HostResources` which expresses
 * what is *promised* to existing servers, this snapshot shows what is
 * *actually being consumed right now* on the machine — CPU load,
 * memory pressure, and disk fill. The Dashboard polls this every few
 * seconds to render a small "machine at a glance" widget so the
 * operator can spot a saturated host without diving into each server.
 */
export interface HostMetrics {
  cpuPercent: number;
  cpuCount: number;
  /** 1 / 5 / 15-minute load average from the kernel. */
  loadAvg: [number, number, number];
  memUsedMb: number;
  memTotalMb: number;
  memPercent: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  diskPercent: number;
  /** Server timestamp at snapshot time (ms since epoch). */
  capturedAt: number;
}

/** Sums `idle` and total CPU time across all cores. */
function sampleCpuTimes(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) {
      total += value;
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/**
 * Returns the host CPU usage as a percentage, computed from two
 * `os.cpus()` snapshots 200 ms apart. Blocks the event loop briefly,
 * which is acceptable for a metrics endpoint that runs at most once
 * every few seconds.
 */
async function getCpuPercent(): Promise<number> {
  const first = sampleCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const second = sampleCpuTimes();
  const totalDelta = second.total - first.total;
  const idleDelta = second.idle - first.idle;
  if (totalDelta <= 0) return 0;
  const percent = ((totalDelta - idleDelta) / totalDelta) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

/**
 * Reads `/proc/meminfo` for an accurate "available" memory figure on
 * Linux (which accounts for reclaimable caches). Falls back to
 * `os.freemem()` (the very conservative "MemFree" value) when the
 * file is not available — e.g. running the panel on macOS or Windows
 * in dev.
 */
function getMemoryUsage(): { totalMb: number; usedMb: number } {
  try {
    const content = fs.readFileSync('/proc/meminfo', 'utf8');
    const totalKb = parseInt(/MemTotal:\s+(\d+)/.exec(content)?.[1] ?? '0', 10);
    const availableKb = parseInt(/MemAvailable:\s+(\d+)/.exec(content)?.[1] ?? '0', 10);
    if (totalKb > 0 && availableKb > 0) {
      const totalMb = Math.floor(totalKb / 1024);
      const usedMb = Math.floor((totalKb - availableKb) / 1024);
      return { totalMb, usedMb };
    }
  } catch {
    // Fall through to the os.freemem() fallback.
  }
  const totalMb = Math.floor(os.totalmem() / (1024 * 1024));
  const freeMb = Math.floor(os.freemem() / (1024 * 1024));
  return { totalMb, usedMb: Math.max(0, totalMb - freeMb) };
}

/** Builds the Dashboard's live host-metrics snapshot. */
export async function getHostMetrics(): Promise<HostMetrics> {
  const [cpuPercent, mem, disk] = await Promise.all([
    getCpuPercent(),
    Promise.resolve(getMemoryUsage()),
    getDiskUsage(config.serversPath).catch(
      (): DiskUsage => ({
        totalBytes: 0,
        freeBytes: 0,
        usedBytes: 0,
        reservedBytes: 0,
      }),
    ),
  ]);
  const loadAvg = os.loadavg() as [number, number, number];
  const memPercent =
    mem.totalMb > 0 ? Math.round((mem.usedMb / mem.totalMb) * 100) : 0;
  const diskPercent =
    disk.totalBytes > 0
      ? Math.round((disk.usedBytes / disk.totalBytes) * 100)
      : 0;
  return {
    cpuPercent,
    cpuCount: os.cpus().length,
    loadAvg,
    memUsedMb: mem.usedMb,
    memTotalMb: mem.totalMb,
    memPercent,
    diskUsedBytes: disk.usedBytes,
    diskTotalBytes: disk.totalBytes,
    diskPercent,
    capturedAt: Date.now(),
  };
}
