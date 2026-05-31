import type { SVGProps } from 'react';
import { api, type ApiServer } from '../lib/api';
import { navigate, serverPath } from '../lib/router';
import { useTranslation, type TranslationKey } from '../lib/i18n';

const STATUS_KEY: Record<string, TranslationKey> = {
  INSTALLING: 'status.INSTALLING',
  OFFLINE: 'status.OFFLINE',
  INSTALL_FAILED: 'status.INSTALL_FAILED',
  STARTING: 'status.STARTING',
  RUNNING: 'status.RUNNING',
  STOPPING: 'status.STOPPING',
};

const STATUS_BADGE: Record<string, string> = {
  INSTALLING: 'bg-falcon/15 text-falcon',
  OFFLINE: 'bg-peregrine-700 text-peregrine-200',
  INSTALL_FAILED: 'bg-rose-500/15 text-rose-400',
  STARTING: 'bg-falcon/15 text-falcon',
  RUNNING: 'bg-emerald-500/15 text-emerald-400',
  STOPPING: 'bg-falcon/15 text-falcon',
};

const STATUS_STRIPE: Record<string, string> = {
  INSTALLING: 'bg-falcon',
  OFFLINE: 'bg-peregrine-600',
  INSTALL_FAILED: 'bg-rose-500',
  STARTING: 'bg-falcon',
  RUNNING: 'bg-emerald-500',
  STOPPING: 'bg-falcon',
};

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
      <span className={`text-xs text-peregrine-200 ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

interface ServerCardProps {
  server: ApiServer;
  templateName: string;
  /**
   * Optional override for the owner label (admin view uses it). When
   * omitted, the dashboard automatically shows "shared by X" if the
   * server is not owned by the viewer (based on `server.isOwner`).
   */
  ownerName?: string;
}

/**
 * One game server, displayed as a horizontal row. Clicking the row
 * navigates to the detail page; there are no inline actions here by
 * design (the detail page hosts every action).
 */
export default function ServerCard({
  server,
  templateName,
  ownerName,
}: ServerCardProps) {
  const { t } = useTranslation();

  const statusKey = STATUS_KEY[server.status] ?? 'status.UNKNOWN';
  const badgeStyle =
    STATUS_BADGE[server.status] ?? 'bg-peregrine-700 text-peregrine-200';
  const stripeStyle = STATUS_STRIPE[server.status] ?? 'bg-peregrine-600';

  // Subtitle composition: "Template · [Loader ·] Version [· shared by X]"
  const sharedHint =
    ownerName ?? (!server.isOwner ? server.ownerUsername : null);
  const showLoader = server.loader && server.loader !== 'vanilla';
  const loaderLabel = showLoader
    ? server.loader.charAt(0).toUpperCase() + server.loader.slice(1)
    : null;

  return (
    <button
      type="button"
      onClick={() => navigate(serverPath(server.id))}
      className="group flex w-full items-stretch overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900 text-left transition-colors hover:border-peregrine-600 hover:bg-peregrine-800"
    >
      <span aria-hidden className={`w-1 shrink-0 ${stripeStyle}`} />

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
        {(() => {
          // v0.17.0+: show the uploaded server icon if any, otherwise
          // fall back to the generic server glyph. Cache-busted via the
          // ?v= mtime parameter built into serverIconUrl.
          const iconUrl = api.serverIconUrl(server);
          return iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded-xl object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-peregrine-800 text-peregrine-400">
              <IconServer className="h-5 w-5" />
            </div>
          );
        })()}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-white">
            {server.name}
          </h3>
          {/* Free-text description (v0.13.0+). Shown only when set. */}
          {server.description && (
            <p className="mt-0.5 truncate text-xs italic text-peregrine-300">
              {server.description}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-peregrine-400">
            {templateName}
            {/* Loader chip: only shown for non-vanilla setups, kept in
                falcon (amber) so it pops as a visual hint. */}
            {loaderLabel && (
              <>
                {' '}
                <span className="text-peregrine-600">•</span>{' '}
                <span className="text-falcon">{loaderLabel}</span>
              </>
            )}{' '}
            <span className="text-peregrine-600">•</span>{' '}
            {server.minecraftVersion}
            {sharedHint && (
              <>
                {' '}
                <span className="text-peregrine-600">•</span>{' '}
                <span className="text-peregrine-300">
                  {ownerName
                    ? ownerName
                    : `${t('dashboard.sharedBy')} ${sharedHint}`}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="hidden gap-5 md:flex">
          <Stat label={t('server.portLabel')} value={String(server.port)} mono />
          <Stat
            label={t('server.memoryLabel')}
            value={`${server.memoryMb} MB`}
          />
          <Stat label={t('server.cpuLabel')} value={String(server.cpuLimit)} />
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${badgeStyle}`}
        >
          {t(statusKey)}
        </span>
      </div>
    </button>
  );
}
