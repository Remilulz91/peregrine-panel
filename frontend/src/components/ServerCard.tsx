import type { ApiServer } from '../lib/api';
import { useTranslation, type TranslationKey } from '../lib/i18n';

// Maps a server status to its translation key.
const STATUS_KEY: Record<string, TranslationKey> = {
  INSTALLING: 'status.INSTALLING',
  OFFLINE: 'status.OFFLINE',
  INSTALL_FAILED: 'status.INSTALL_FAILED',
  STARTING: 'status.STARTING',
  RUNNING: 'status.RUNNING',
  STOPPING: 'status.STOPPING',
};

// Maps a server status to the colours of its badge.
const STATUS_STYLE: Record<string, string> = {
  INSTALLING: 'bg-falcon/15 text-falcon',
  OFFLINE: 'bg-peregrine-700 text-peregrine-200',
  INSTALL_FAILED: 'bg-rose-500/15 text-rose-400',
  STARTING: 'bg-falcon/15 text-falcon',
  RUNNING: 'bg-emerald-500/15 text-emerald-400',
  STOPPING: 'bg-falcon/15 text-falcon',
};

interface ServerCardProps {
  server: ApiServer;
  templateName: string;
  onDelete: (server: ApiServer) => void;
}

/** One game server, shown as a card in the dashboard list. */
export default function ServerCard({
  server,
  templateName,
  onDelete,
}: ServerCardProps) {
  const { t } = useTranslation();
  const statusKey = STATUS_KEY[server.status] ?? 'status.UNKNOWN';
  const statusStyle =
    STATUS_STYLE[server.status] ?? 'bg-peregrine-700 text-peregrine-200';

  return (
    <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-white">{server.name}</h3>
          <p className="mt-0.5 text-xs text-peregrine-400">{templateName}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle}`}
        >
          {t(statusKey)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-peregrine-400">{t('server.versionLabel')}</dt>
          <dd className="mt-0.5 text-peregrine-200">
            {server.minecraftVersion}
          </dd>
        </div>
        <div>
          <dt className="text-peregrine-400">{t('server.memoryLabel')}</dt>
          <dd className="mt-0.5 text-peregrine-200">{server.memoryMb} MB</dd>
        </div>
        <div>
          <dt className="text-peregrine-400">{t('server.portLabel')}</dt>
          <dd className="mt-0.5 font-mono text-peregrine-200">{server.port}</dd>
        </div>
      </dl>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => onDelete(server)}
          className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
        >
          {t('server.delete')}
        </button>
      </div>
    </div>
  );
}
