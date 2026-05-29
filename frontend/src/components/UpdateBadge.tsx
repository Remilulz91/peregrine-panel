import { useEffect, useState } from 'react';
import { api, type ApiUpdateInfo } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';

/**
 * Small amber pill in the header that links to the latest GitHub
 * release when the running panel is behind. Rendered admin-only
 * (since only admins can apply an update by pulling and rebuilding).
 * Fails quietly: if /api/updates is unreachable, nothing is shown.
 */
export default function UpdateBadge() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [info, setInfo] = useState<ApiUpdateInfo | null>(null);

  useEffect(() => {
    if (user?.role !== 'ADMIN') return;
    let cancelled = false;
    api
      .updateInfo()
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        // Silent — no badge is fine.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  if (user?.role !== 'ADMIN') return null;
  if (!info || info.upToDate) return null;
  if (!info.latestVersion || !info.releaseUrl) return null;

  const label = t('update.available').replace('{version}', info.latestVersion);

  return (
    <a
      href={info.releaseUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={t('update.viewRelease')}
      className="hidden items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/20 sm:inline-flex"
    >
      <span aria-hidden>↻</span>
      {label}
    </a>
  );
}
