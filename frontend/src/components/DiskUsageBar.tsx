import type { ApiDiskUsage } from '../lib/api';
import { useTranslation } from '../lib/i18n';

interface DiskUsageBarProps {
  usage: ApiDiskUsage;
}

/** Formats a byte count into a short human-readable size. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

/**
 * Compact disk-usage indicator: a horizontal bar that shows used / reserved
 * / free, plus the numbers below it. The "reserved" zone is the safety
 * margin Peregrine refuses to dip into.
 */
export default function DiskUsageBar({ usage }: DiskUsageBarProps) {
  const { t } = useTranslation();
  const total = Math.max(usage.totalBytes, 1);
  // The "really usable" free is freeBytes - reservedBytes (could be
  // negative if the disk is already over the reserve).
  const usableFree = Math.max(0, usage.freeBytes - usage.reservedBytes);
  const pctUsed = (usage.usedBytes / total) * 100;
  const pctReserved = (Math.min(usage.reservedBytes, usage.freeBytes) / total) * 100;
  // Lights up amber when the free space drops below 2x the reserve so
  // the user knows the disk is starting to get tight.
  const lowSpace = usage.freeBytes < usage.reservedBytes * 2;

  return (
    <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{t('disk.title')}</h3>
        <span
          className={`text-xs ${
            lowSpace ? 'text-falcon' : 'text-peregrine-400'
          }`}
        >
          {formatBytes(usableFree)} {t('disk.free').toLowerCase()}
        </span>
      </div>

      {/* The bar: used segment + reserved segment + remaining free space */}
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-peregrine-800">
        <span
          className="h-full bg-peregrine-500"
          style={{ width: `${pctUsed}%` }}
          title={`${t('disk.used')}: ${formatBytes(usage.usedBytes)}`}
        />
        <span
          className="h-full bg-falcon/50"
          style={{ width: `${pctReserved}%` }}
          title={`${t('disk.reserved')}: ${formatBytes(usage.reservedBytes)}`}
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-peregrine-300">
        <div>
          <dt className="text-peregrine-500">{t('disk.used')}</dt>
          <dd className="mt-0.5">{formatBytes(usage.usedBytes)}</dd>
        </div>
        <div>
          <dt className="text-peregrine-500">{t('disk.reserved')}</dt>
          <dd className="mt-0.5">{formatBytes(usage.reservedBytes)}</dd>
        </div>
        <div>
          <dt className="text-peregrine-500">{t('disk.free')}</dt>
          <dd className="mt-0.5">{formatBytes(usage.freeBytes)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-peregrine-500">{t('disk.reservedHint')}</p>
    </div>
  );
}
