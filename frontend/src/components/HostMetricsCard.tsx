import { useEffect, useState } from 'react';
import { api, ApiError, type ApiHostMetrics } from '../lib/api';
import { useTranslation } from '../lib/i18n';

/**
 * Live host overview shown on the Dashboard (v0.28.0+). Refreshed every
 * 5 seconds while the widget is mounted. Three columns: CPU %, RAM in
 * GiB, disk usage on the data volume. A small bar coloured from green
 * → amber → red gives an instant "is my machine OK" read.
 */
const POLL_INTERVAL_MS = 5000;

function formatGiB(mb: number): string {
  if (mb <= 0) return '0';
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatBytesGiB(bytes: number): string {
  if (bytes <= 0) return '0';
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

function barColour(percent: number): string {
  if (percent >= 90) return 'bg-rose-500';
  if (percent >= 75) return 'bg-amber-500';
  return 'bg-emerald-500';
}

interface MetricBlockProps {
  label: string;
  percent: number;
  detail: string;
}

function MetricBlock({ label, percent, detail }: MetricBlockProps) {
  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-peregrine-400">
          {label}
        </p>
        <p className="text-lg font-semibold text-white">{percent}%</p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-peregrine-800">
        <div
          className={`h-full transition-all duration-500 ${barColour(percent)}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-peregrine-400">{detail}</p>
    </div>
  );
}

export default function HostMetricsCard() {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<ApiHostMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const { metrics: m } = await api.hostMetrics();
        if (!cancelled) {
          setMetrics(m);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
        }
      }
    }
    void tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [t]);

  if (error && !metrics) {
    return (
      <section className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
        {error}
      </section>
    );
  }

  if (!metrics) {
    return (
      <section className="mb-6 rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5 text-sm text-peregrine-400">
        {t('host.loading')}
      </section>
    );
  }

  const loadAvgText = metrics.loadAvg.map((v) => v.toFixed(2)).join(' · ');

  return (
    <section className="mb-6 rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-peregrine-300">
          {t('host.title')}
        </h2>
        <p className="text-xs text-peregrine-500">
          {t('host.loadAvg')} {loadAvgText}
        </p>
      </div>
      <div className="flex flex-col gap-6 md:flex-row md:gap-8">
        <MetricBlock
          label={t('host.cpu')}
          percent={metrics.cpuPercent}
          detail={t('host.cpuDetail').replace('{cores}', String(metrics.cpuCount))}
        />
        <MetricBlock
          label={t('host.ram')}
          percent={metrics.memPercent}
          detail={`${formatGiB(metrics.memUsedMb)} / ${formatGiB(metrics.memTotalMb)}`}
        />
        <MetricBlock
          label={t('host.disk')}
          percent={metrics.diskPercent}
          detail={`${formatBytesGiB(metrics.diskUsedBytes)} / ${formatBytesGiB(metrics.diskTotalBytes)}`}
        />
      </div>
    </section>
  );
}
