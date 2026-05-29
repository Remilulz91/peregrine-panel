import os from 'node:os';
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
 * reserve concept in lib/disk.ts.
 */
const RESERVED_MEM_MB = 1024;
const RESERVED_CPUS = 1;

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
