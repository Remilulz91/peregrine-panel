import type { Readable } from 'node:stream';
import Docker from 'dockerode';
import { config } from '../config';

const docker = new Docker({ socketPath: config.dockerSocket });

/**
 * One sample from Docker's `container.stats` stream, already turned
 * into the values the UI cares about (v0.21.0+).
 */
export interface LiveStatsTick {
  /** CPU usage in percent (0-100 per allocated core; >100 = bursting). */
  cpuPercent: number;
  /** Memory currently used by the container, in bytes (excludes cache). */
  memoryBytes: number;
  /** Memory limit set on the container, in bytes. */
  memoryLimitBytes: number;
  /** Memory usage as a percentage of the limit. */
  memoryPercent: number;
  /** Container uptime in seconds. Computed once at subscribe. */
  uptimeSeconds: number;
  /** Wall-clock time of this sample (ms since epoch), for the UI graphs. */
  ts: number;
}

interface RawCpuStats {
  cpu_usage: { total_usage: number; percpu_usage?: number[] };
  system_cpu_usage?: number;
  online_cpus?: number;
}

interface RawMemoryStats {
  usage?: number;
  limit?: number;
  stats?: { cache?: number; file?: number; inactive_file?: number };
}

interface RawStatsSample {
  cpu_stats: RawCpuStats;
  precpu_stats: RawCpuStats;
  memory_stats: RawMemoryStats;
}

/**
 * Computes CPU usage as a percentage of host cores from a Docker
 * stats sample. Returns 0 on the first sample (precpu_stats is empty)
 * or when system usage hasn't advanced. The result is "% of one
 * core × number of cores", so a container using 2 full cores reports
 * 200% — matching `docker stats` output.
 */
function calcCpuPercent(sample: RawStatsSample): number {
  const cpu = sample.cpu_stats;
  const pre = sample.precpu_stats;
  const cpuDelta = cpu.cpu_usage.total_usage - (pre.cpu_usage?.total_usage ?? 0);
  const systemDelta = (cpu.system_cpu_usage ?? 0) - (pre.system_cpu_usage ?? 0);
  if (cpuDelta <= 0 || systemDelta <= 0) return 0;
  const cores =
    cpu.online_cpus ?? cpu.cpu_usage.percpu_usage?.length ?? 1;
  return (cpuDelta / systemDelta) * cores * 100;
}

/**
 * Returns the memory currently in active use by the container,
 * excluding the page cache. itzg's Minecraft image loves to fill the
 * page cache with world data; counting that as "used" would make the
 * widget useless.
 */
function calcMemoryUsed(sample: RawStatsSample): number {
  const mem = sample.memory_stats;
  const usage = mem.usage ?? 0;
  // Docker exposes either `cache` (cgroup v1) or `inactive_file` /
  // `file` (cgroup v2). Subtract whichever is present.
  const inactive =
    mem.stats?.cache ??
    mem.stats?.inactive_file ??
    mem.stats?.file ??
    0;
  return Math.max(0, usage - inactive);
}

/**
 * Subscribes to a container's `docker stats` stream and invokes
 * `onTick` for every sample. Returns a stop function — call it when
 * the last UI consumer disconnects so the stream is released.
 *
 * Errors during the stream are reported via `onError` but the stream
 * is not auto-restarted; the caller can re-subscribe if it wants.
 */
export async function streamContainerStats(
  containerId: string,
  onTick: (tick: LiveStatsTick) => void,
  onError?: (err: Error) => void,
): Promise<() => void> {
  const container = docker.getContainer(containerId);

  // Snapshot the start time once so we can include uptime in every tick.
  let startedAt = 0;
  try {
    const info = await container.inspect();
    startedAt = Date.parse(info.State.StartedAt) || 0;
  } catch {
    // Container might already be gone; leave startedAt = 0 → uptime 0.
  }

  const stream = (await container.stats({ stream: true })) as unknown as Readable;
  let buffer = '';
  let stopped = false;

  stream.on('data', (chunk: Buffer) => {
    if (stopped) return;
    buffer += chunk.toString('utf8');
    // Docker emits one JSON object per "frame" but the encoder doesn't
    // always end on a newline; parse greedily until we run out of
    // complete JSON values.
    let nextStart = 0;
    while (nextStart < buffer.length) {
      const nl = buffer.indexOf('\n', nextStart);
      if (nl === -1) break;
      const line = buffer.slice(nextStart, nl).trim();
      nextStart = nl + 1;
      if (!line) continue;
      try {
        const sample = JSON.parse(line) as RawStatsSample;
        const memoryBytes = calcMemoryUsed(sample);
        const memoryLimitBytes = sample.memory_stats.limit ?? 0;
        onTick({
          cpuPercent: calcCpuPercent(sample),
          memoryBytes,
          memoryLimitBytes,
          memoryPercent:
            memoryLimitBytes > 0 ? (memoryBytes / memoryLimitBytes) * 100 : 0,
          uptimeSeconds:
            startedAt > 0 ? Math.floor((Date.now() - startedAt) / 1000) : 0,
          ts: Date.now(),
        });
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
    buffer = buffer.slice(nextStart);
  });

  stream.on('error', (err) => {
    if (!stopped) onError?.(err);
  });

  return () => {
    stopped = true;
    stream.destroy();
  };
}
