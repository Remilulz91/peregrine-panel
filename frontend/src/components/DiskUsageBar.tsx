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
 * Compact disk-usage indicator: a horizontal bar split into three
 * visible segments — Used (grey) | Usable free (emerald) | Reserved
 * (amber). The amber segment sits at the right edge as the "wall"
 * Peregrine refuses to cross, even when the disk is mostly empty.
 */
export default function DiskUsageBar({ usage }: DiskUsageBarProps) {
  const { t } = useTranslation();
  const total = Math.max(usage.totalBytes, 1);
  // Peregrine's reserve is taken from the free space, so the "really
  // usable" free is freeBytes - reservedBytes (clamped to >= 0).
  const usableFreeBytes = Math.max(0, usage.freeBytes - usage.reservedBytes);
  const reservedShown = Math.min(usage.reservedBytes, usage.freeBytes);

  const pctUsed = (usage.usedBytes / total) * 100;
  const pctUsable = (usableFreeBytes / total) * 100;
  const pctReserved = (reservedShown / total) * 100;

  // Lights up amber when usable free drops below the reserve so the
  // user knows the disk is starting to get tight.
  const lowSpace = usableFreeBytes < usage.reservedBytes;

  return (
    <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{t('disk.title')}</h3>
        <span
          className={`text-xs ${
            lowSpace ? 'text-falcon' : 'text-peregrine-300'
          }`}
        >
          {formatBytes(usableFreeBytes)} {t('disk.free').toLowerCase()}
        </span>
      </div>

      {/* The bar: used | usable free | reserved. Order matters — reserved
          is glued to the right so it visually represents the "wall". */}
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-peregrine-800 ring-1 ring-inset ring-peregrine-700">
        <span
          className="h-full bg-peregrine-400"
          style={{ width: `${pctUsed}%` }}
          title={`${t('disk.used')}: ${formatBytes(usage.usedBytes)}`}
        />
        <span
          className="h-full bg-emerald-500/70"
          style={{ width: `${pctUsable}%` }}
          title={`${t('disk.free')}: ${formatBytes(usableFreeBytes)}`}
        />
        <span
          className="h-full bg-falcon/70"
          style={{ width: `${pctReserved}%` }}
          title={`${t('disk.reserved')}: ${formatBytes(usage.reservedBytes)}`}
        />
      </div>

      {/* Three-column legend — the dot colour matches the bar segment, so
          the user can map them at a glance. */}
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-peregrine-300">
        <div>
          <dt className="flex items-center gap-1.5 text-peregrine-500">
            <span className="inline-block h-2 w-2 rounded-full bg-peregrine-400" />
            {t('disk.used')}
          </dt>
          <dd className="mt-0.5">{formatBytes(usage.usedBytes)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-peregrine-500">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500/70" />
            {t('disk.free')}
          </dt>
          <dd className="mt-0.5">{formatBytes(usableFreeBytes)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-peregrine-500">
            <span className="inline-block h-2 w-2 rounded-full bg-falcon/70" />
            {t('disk.reserved')}
          </dt>
          <dd className="mt-0.5">{formatBytes(usage.reservedBytes)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-peregrine-500">{t('disk.reservedHint')}</p>
    </div>
  );
}
