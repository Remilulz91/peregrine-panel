import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useTranslation } from '../lib/i18n';

interface LiveStatsTick {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  uptimeSeconds: number;
  ts: number;
}

interface LiveStatsProps {
  serverId: string;
  serverRunning: boolean;
  /** Container CPU allocation, in cores (e.g. 2 = 2 cores). */
  cpuLimit: number;
}

/** Number of samples kept in the rolling history. ~1 tick/s → 60 s. */
const HISTORY_LIMIT = 60;

/**
 * Live container stats sidebar for the Console tab (v0.21.0+).
 *
 * Connects to the same Socket.IO endpoint as the console, subscribes
 * to `stats:tick` events for the given server, and renders three
 * widgets (CPU%, Memory used/limit, Uptime) plus two mini sparklines
 * (CPU + Memory) so the user can spot lag at a glance.
 */
export default function LiveStats({
  serverId,
  serverRunning,
  cpuLimit,
}: LiveStatsProps) {
  const { t } = useTranslation();
  const [latest, setLatest] = useState<LiveStatsTick | null>(null);
  const [history, setHistory] = useState<LiveStatsTick[]>([]);
  const socketRef = useRef<Socket | null>(null);

  // Subscribe whenever the server transitions from OFFLINE → RUNNING.
  useEffect(() => {
    if (!serverRunning) {
      setLatest(null);
      setHistory([]);
      return;
    }

    const socket = io();
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('stats:subscribe', serverId);
    });

    socket.on('stats:tick', (tick: LiveStatsTick) => {
      setLatest(tick);
      setHistory((prev) => {
        const next = [...prev, tick];
        if (next.length > HISTORY_LIMIT) next.shift();
        return next;
      });
    });

    return () => {
      socket.emit('stats:unsubscribe');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverId, serverRunning]);

  const offline = !serverRunning;
  const cpuStr = offline
    ? t('stats.offline')
    : latest
    ? formatCpu(latest.cpuPercent, cpuLimit)
    : '…';
  const memStr = offline
    ? t('stats.offline')
    : latest
    ? formatMemory(latest.memoryBytes, latest.memoryLimitBytes)
    : '…';
  const uptimeStr = offline
    ? t('stats.offline')
    : latest
    ? formatUptime(latest.uptimeSeconds)
    : '…';
  const memPct = offline
    ? null
    : latest
    ? Math.round(latest.memoryPercent)
    : null;

  return (
    <div className="space-y-3">
      <StatBox
        label={t('stats.cpu')}
        value={cpuStr}
        offline={offline}
        accent="text-falcon"
      />
      <StatBox
        label={t('stats.memory')}
        value={memStr}
        sub={memPct !== null ? `${memPct}%` : undefined}
        offline={offline}
        accent="text-emerald-400"
      />
      <StatBox
        label={t('stats.uptime')}
        value={uptimeStr}
        offline={offline}
        accent="text-peregrine-200"
      />

      {/* Sparklines — only shown when we have history. */}
      {!offline && history.length > 1 && (
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-peregrine-500">
            {t('stats.last60s')}
          </p>
          <div className="space-y-3">
            <Sparkline
              label={t('stats.cpu')}
              values={history.map((h) => h.cpuPercent)}
              color="#fb923c"
              max={Math.max(100 * cpuLimit, 50)}
              suffix="%"
            />
            <Sparkline
              label={t('stats.memory')}
              values={history.map((h) => h.memoryPercent)}
              color="#34d399"
              max={100}
              suffix="%"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface StatBoxProps {
  label: string;
  value: string;
  sub?: string;
  offline: boolean;
  accent: string;
}

function StatBox({ label, value, sub, offline, accent }: StatBoxProps) {
  return (
    <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-peregrine-500">
        {label}
      </p>
      <p
        className={`mt-1 font-mono text-base ${offline ? 'text-peregrine-500' : accent}`}
      >
        {value}
      </p>
      {sub && !offline && (
        <p className="mt-0.5 text-xs text-peregrine-400">{sub}</p>
      )}
    </div>
  );
}

interface SparklineProps {
  label: string;
  values: number[];
  color: string;
  max: number;
  suffix: string;
}

function Sparkline({ label, values, color, max, suffix }: SparklineProps) {
  if (values.length < 2) return null;
  const width = 220;
  const height = 36;
  const lastValue = values[values.length - 1];

  // Scale the path. Each point is a step of width/(N-1).
  const step = width / (values.length - 1);
  const path = values
    .map((v, i) => {
      const x = i * step;
      const y = height - Math.max(0, Math.min(1, v / max)) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-peregrine-400">{label}</span>
        <span className="font-mono text-peregrine-200">
          {lastValue.toFixed(1)}
          {suffix}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-1 w-full"
        preserveAspectRatio="none"
      >
        {/* Filled area under the line for a nicer look. */}
        <path
          d={`${path} L${width},${height} L0,${height} Z`}
          fill={color}
          fillOpacity="0.15"
        />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// --- Formatting helpers -----------------------------------------------------

function formatCpu(percent: number, cpuLimit: number): string {
  // Docker stats reports CPU as % of one core × total cores. We show
  // it as a fraction of allocated cores (more intuitive).
  const allocPct = cpuLimit > 0 ? percent / cpuLimit : percent;
  return `${allocPct.toFixed(1)}%`;
}

function formatMemory(used: number, limit: number): string {
  const usedMb = used / (1024 * 1024);
  const limitMb = limit / (1024 * 1024);
  if (limit === 0) return `${usedMb.toFixed(0)} MiB`;
  if (limitMb >= 1024) {
    return `${(usedMb / 1024).toFixed(2)} / ${(limitMb / 1024).toFixed(2)} GiB`;
  }
  return `${usedMb.toFixed(0)} / ${limitMb.toFixed(0)} MiB`;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
