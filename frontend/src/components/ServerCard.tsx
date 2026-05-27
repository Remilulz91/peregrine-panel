import { useState, type SVGProps } from 'react';
import type { ApiServer, ServerAction } from '../lib/api';
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

// Colours of the status badge (small pill on the right side of the row).
const STATUS_BADGE: Record<string, string> = {
  INSTALLING: 'bg-falcon/15 text-falcon',
  OFFLINE: 'bg-peregrine-700 text-peregrine-200',
  INSTALL_FAILED: 'bg-rose-500/15 text-rose-400',
  STARTING: 'bg-falcon/15 text-falcon',
  RUNNING: 'bg-emerald-500/15 text-emerald-400',
  STOPPING: 'bg-falcon/15 text-falcon',
};

// Colour of the vertical status stripe glued to the left edge of the row.
const STATUS_STRIPE: Record<string, string> = {
  INSTALLING: 'bg-falcon',
  OFFLINE: 'bg-peregrine-600',
  INSTALL_FAILED: 'bg-rose-500',
  STARTING: 'bg-falcon',
  RUNNING: 'bg-emerald-500',
  STOPPING: 'bg-falcon',
};

// --- Inline SVG icons -----------------------------------------------------
// Tiny, currentColor-driven so they pick up the surrounding text colour.

function IconServer(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <line x1="7" y1="7.5" x2="7.01" y2="7.5" />
      <line x1="7" y1="16.5" x2="7.01" y2="16.5" />
    </svg>
  );
}

function IconPlay(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M8 5.5v13a1 1 0 0 0 1.55.83l10-6.5a1 1 0 0 0 0-1.66l-10-6.5A1 1 0 0 0 8 5.5z" />
    </svg>
  );
}

function IconStop(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  );
}

function IconRestart(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 9 8 9" />
    </svg>
  );
}

function IconConsole(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <polyline points="7 10 10 13 7 16" />
      <line x1="13" y1="16" x2="17" y2="16" />
    </svg>
  );
}

function IconFolder(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function IconTrash(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polyline points="4 7 20 7" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

// --- Stat tile ------------------------------------------------------------

interface StatProps {
  label: string;
  value: string;
  mono?: boolean;
}

function Stat({ label, value, mono }: StatProps) {
  return (
    <div className="flex min-w-[64px] flex-col items-end">
      <span className="text-[10px] uppercase tracking-wider text-peregrine-500">
        {label}
      </span>
      <span
        className={`text-xs text-peregrine-200 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

// --- ServerCard -----------------------------------------------------------

// Compact icon button reused for Stop/Restart/Console/Files.
const ICON_BUTTON =
  'rounded-lg border border-peregrine-700 p-2 text-peregrine-200 transition-colors hover:bg-peregrine-800 disabled:cursor-not-allowed disabled:opacity-50';

interface ServerCardProps {
  server: ApiServer;
  templateName: string;
  /** Optional — shown in the subtitle, used by the admin view. */
  ownerName?: string;
  onAction: (server: ApiServer, action: ServerAction) => Promise<void>;
  onConsole: (server: ApiServer) => void;
  onFiles: (server: ApiServer) => void;
  onDelete: (server: ApiServer) => void;
}

/** One game server, displayed as a horizontal row in the dashboard list. */
export default function ServerCard({
  server,
  templateName,
  ownerName,
  onAction,
  onConsole,
  onFiles,
  onDelete,
}: ServerCardProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const statusKey = STATUS_KEY[server.status] ?? 'status.UNKNOWN';
  const badgeStyle =
    STATUS_BADGE[server.status] ?? 'bg-peregrine-700 text-peregrine-200';
  const stripeStyle =
    STATUS_STRIPE[server.status] ?? 'bg-peregrine-600';
  const isProvisioned =
    server.status === 'OFFLINE' || server.status === 'RUNNING';

  async function runAction(action: ServerAction): Promise<void> {
    setBusy(true);
    try {
      await onAction(server, action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group flex items-stretch overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900 transition-colors hover:border-peregrine-600">
      {/* Status stripe on the left edge — colour reflects RUNNING / OFFLINE / ... */}
      <span
        aria-hidden
        className={`w-1 shrink-0 ${stripeStyle}`}
      />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
        {/* Server icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-peregrine-800 text-peregrine-400">
          <IconServer className="h-5 w-5" />
        </div>

        {/* Name + subtitle (template • version, plus optional owner) */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">
            {server.name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-peregrine-400">
            {templateName}{' '}
            <span className="text-peregrine-600">•</span>{' '}
            {server.minecraftVersion}
            {ownerName && (
              <>
                {' '}
                <span className="text-peregrine-600">•</span>{' '}
                <span className="text-peregrine-300">{ownerName}</span>
              </>
            )}
          </p>
        </div>

        {/* Stats — hidden on small screens to keep the row readable */}
        <div className="hidden gap-5 md:flex">
          <Stat label={t('server.portLabel')} value={String(server.port)} mono />
          <Stat
            label={t('server.memoryLabel')}
            value={`${server.memoryMb} MB`}
          />
          <Stat label={t('server.cpuLabel')} value={String(server.cpuLimit)} />
        </div>

        {/* Status badge */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${badgeStyle}`}
        >
          {t(statusKey)}
        </span>

        {/* Actions — primary state action first, then secondary tools, then delete */}
        <div className="flex shrink-0 gap-1.5">
          {server.status === 'OFFLINE' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction('start')}
              title={t('server.start')}
              aria-label={t('server.start')}
              className="rounded-lg bg-falcon p-2 text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconPlay className="h-4 w-4" />
            </button>
          )}
          {server.status === 'RUNNING' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction('stop')}
                title={t('server.stop')}
                aria-label={t('server.stop')}
                className={ICON_BUTTON}
              >
                <IconStop className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void runAction('restart')}
                title={t('server.restart')}
                aria-label={t('server.restart')}
                className={ICON_BUTTON}
              >
                <IconRestart className="h-4 w-4" />
              </button>
            </>
          )}
          {isProvisioned && (
            <>
              <button
                type="button"
                onClick={() => onConsole(server)}
                title={t('server.console')}
                aria-label={t('server.console')}
                className={ICON_BUTTON}
              >
                <IconConsole className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onFiles(server)}
                title={t('server.files')}
                aria-label={t('server.files')}
                className={ICON_BUTTON}
              >
                <IconFolder className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onDelete(server)}
            title={t('server.delete')}
            aria-label={t('server.delete')}
            className="rounded-lg border border-peregrine-700 p-2 text-rose-400 transition-colors hover:bg-rose-500/10"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
