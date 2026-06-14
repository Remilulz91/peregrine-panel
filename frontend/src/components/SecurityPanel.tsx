/**
 * Admin-only Security dashboard (v0.39.0+).
 *
 * Renders inside `AdminPanel.tsx` under the "Security" tab. Three
 * cards: a stats header, the top failed-auth offenders (last 7 d),
 * and the raw recent attempts table; plus a fail2ban currently-
 * banned-IPs card if the integration is wired up on the host.
 *
 * Visibility is doubly enforced — the API routes themselves check
 * the ADMIN role via `authenticateAdmin`, this component is just the
 * UI for the same data.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  type ApiFail2banStatus,
  type ApiSecurityFailedLogins,
} from '../lib/api';
import { useTranslation } from '../lib/i18n';

const POLL_MS = 30_000;

/** Renders an absolute timestamp + a short "x mins ago" suffix. */
function formatWhen(iso: string, language: string): string {
  const ts = new Date(iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(ts.getTime())) return iso;
  const ago = Math.floor((Date.now() - ts.getTime()) / 1000);
  let agoLabel: string;
  if (ago < 60) agoLabel = `${ago}s`;
  else if (ago < 3600) agoLabel = `${Math.floor(ago / 60)}m`;
  else if (ago < 86400) agoLabel = `${Math.floor(ago / 3600)}h`;
  else agoLabel = `${Math.floor(ago / 86400)}d`;
  return `${ts.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US')} (${agoLabel})`;
}

/** Same idea for the fail2ban Unix-epoch fields. */
function formatEpoch(epoch: number, language: string): string {
  const ts = new Date(epoch * 1000);
  if (Number.isNaN(ts.getTime())) return String(epoch);
  return ts.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US');
}

/** Renders the duration left on a ban — "in 32m", "in 4h12m", "expired". */
function formatExpiresIn(expiresAt: number | null, language: string): string {
  if (expiresAt === null) {
    return language === 'fr' ? 'permanent' : 'permanent';
  }
  const sec = expiresAt - Math.floor(Date.now() / 1000);
  if (sec <= 0) return language === 'fr' ? 'expiré' : 'expired';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400)
    return `${Math.floor(sec / 3600)}h${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d`;
}

/** Maps an auth_events kind to a coloured badge class. */
function kindBadge(kind: string): string {
  if (kind.includes('rate_limited')) {
    return 'bg-amber-500/15 text-amber-400';
  }
  if (kind.includes('mfa')) {
    return 'bg-violet-500/15 text-violet-300';
  }
  if (kind.includes('sftp')) {
    return 'bg-blue-500/15 text-blue-300';
  }
  return 'bg-rose-500/15 text-rose-400';
}

export default function SecurityPanel() {
  const { t, language } = useTranslation();

  const [data, setData] = useState<ApiSecurityFailedLogins | null>(null);
  const [bans, setBans] = useState<ApiFail2banStatus | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const [logins, banned] = await Promise.all([
        api.adminSecurityFailedLogins(100, 7),
        api.adminSecurityBannedIps(),
      ]);
      setData(logins);
      setBans(banned.status);
      setLoadError(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Should never happen — admin-gated — but render gracefully.
      }
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loadError && data === null) {
    return (
      <section className="mt-8">
        <p className="text-sm text-rose-400">{t('admin.security.loadError')}</p>
      </section>
    );
  }
  if (data === null) {
    return (
      <section className="mt-8">
        <p className="text-sm text-peregrine-400">{t('common.loading')}</p>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-8">
      {/* -------- Stats header -------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label={t('admin.security.stat.last24h')}
          value={data.stats.last24h}
        />
        <StatCard
          label={t('admin.security.stat.last7d')}
          value={data.stats.last7d}
        />
        <StatCard
          label={t('admin.security.stat.distinctUsernames')}
          value={data.stats.distinctUsernames7d}
        />
        <StatCard
          label={t('admin.security.stat.distinctIps')}
          value={data.stats.distinctIps7d}
        />
      </div>

      {/* -------- fail2ban -------- */}
      <div>
        <h2 className="text-base font-semibold text-white">
          {t('admin.security.bansTitle')}
        </h2>
        <p className="mt-1 text-xs text-peregrine-400">
          {t('admin.security.bansSubtitle')}
        </p>

        {!bans || !bans.available ? (
          <div className="mt-4 rounded-2xl border border-dashed border-peregrine-700 p-4 text-sm text-peregrine-400">
            <p className="font-medium text-peregrine-200">
              {t(
                bans?.reason === 'unreadable'
                  ? 'admin.security.bansUnreadable'
                  : bans?.reason === 'bad_schema'
                    ? 'admin.security.bansBadSchema'
                    : 'admin.security.bansNotConfigured',
              )}
            </p>
            <p className="mt-1 text-xs">
              {t('admin.security.bansSetupHint')}
            </p>
          </div>
        ) : bans.bans.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-peregrine-800 bg-peregrine-900 p-4 text-sm text-peregrine-300">
            {t('admin.security.bansEmpty').replace(
              '{n}',
              String(bans.jails.length),
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-peregrine-700">
            <table className="min-w-full divide-y divide-peregrine-800 text-sm">
              <thead className="bg-peregrine-900 text-left text-xs uppercase tracking-wider text-peregrine-400">
                <tr>
                  <th className="px-4 py-2">{t('admin.security.col.jail')}</th>
                  <th className="px-4 py-2">{t('admin.security.col.ip')}</th>
                  <th className="px-4 py-2">
                    {t('admin.security.col.bannedAt')}
                  </th>
                  <th className="px-4 py-2">
                    {t('admin.security.col.expiresIn')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-peregrine-800 text-peregrine-200">
                {bans.bans.map((b) => (
                  <tr key={`${b.jail}-${b.ip}-${b.bannedAt}`}>
                    <td className="px-4 py-2 font-medium text-white">
                      {b.jail}
                    </td>
                    <td className="px-4 py-2 font-mono text-peregrine-200">
                      {b.ip}
                    </td>
                    <td className="px-4 py-2 text-xs text-peregrine-400">
                      {formatEpoch(b.bannedAt, language)}
                    </td>
                    <td className="px-4 py-2 text-xs text-peregrine-300">
                      {formatExpiresIn(b.expiresAt, language)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -------- Top offenders -------- */}
      <div>
        <h2 className="text-base font-semibold text-white">
          {t('admin.security.offendersTitle')}
        </h2>
        <p className="mt-1 text-xs text-peregrine-400">
          {t('admin.security.offendersSubtitle')}
        </p>

        {data.topOffenders.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-peregrine-700 p-4 text-sm text-peregrine-400">
            {t('admin.security.offendersEmpty')}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-peregrine-700">
            <table className="min-w-full divide-y divide-peregrine-800 text-sm">
              <thead className="bg-peregrine-900 text-left text-xs uppercase tracking-wider text-peregrine-400">
                <tr>
                  <th className="px-4 py-2">
                    {t('admin.security.col.username')}
                  </th>
                  <th className="px-4 py-2">{t('admin.security.col.ip')}</th>
                  <th className="px-4 py-2 text-right">
                    {t('admin.security.col.attempts')}
                  </th>
                  <th className="px-4 py-2">
                    {t('admin.security.col.lastAt')}
                  </th>
                  <th className="px-4 py-2">
                    {t('admin.security.col.kinds')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-peregrine-800 text-peregrine-200">
                {data.topOffenders.map((row, idx) => (
                  <tr key={`${row.username}-${row.remoteIp}-${idx}`}>
                    <td className="px-4 py-2 font-medium text-white">
                      {row.username}
                    </td>
                    <td className="px-4 py-2 font-mono text-peregrine-200">
                      {row.remoteIp}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {row.attempts}
                    </td>
                    <td className="px-4 py-2 text-xs text-peregrine-400">
                      {formatWhen(row.lastAt, language)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(row.byKind).map(([k, n]) => (
                          <span
                            key={k}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${kindBadge(k)}`}
                            title={k}
                          >
                            {k.replace('auth.', '')} × {n}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -------- Recent raw attempts -------- */}
      <div>
        <h2 className="text-base font-semibold text-white">
          {t('admin.security.recentTitle')}
        </h2>
        <p className="mt-1 text-xs text-peregrine-400">
          {t('admin.security.recentSubtitle').replace(
            '{n}',
            String(data.recent.length),
          )}
        </p>

        {data.recent.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-peregrine-700 p-4 text-sm text-peregrine-400">
            {t('admin.security.recentEmpty')}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-peregrine-700">
            <table className="min-w-full divide-y divide-peregrine-800 text-sm">
              <thead className="bg-peregrine-900 text-left text-xs uppercase tracking-wider text-peregrine-400">
                <tr>
                  <th className="px-4 py-2">
                    {t('admin.security.col.when')}
                  </th>
                  <th className="px-4 py-2">
                    {t('admin.security.col.kind')}
                  </th>
                  <th className="px-4 py-2">
                    {t('admin.security.col.username')}
                  </th>
                  <th className="px-4 py-2">{t('admin.security.col.ip')}</th>
                  <th className="px-4 py-2">
                    {t('admin.security.col.details')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-peregrine-800 text-peregrine-200">
                {data.recent.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 text-xs text-peregrine-400">
                      {formatWhen(row.createdAt, language)}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${kindBadge(row.kind)}`}
                      >
                        {row.kind.replace('auth.', '')}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-white">
                      {row.username ?? '—'}
                    </td>
                    <td className="px-4 py-2 font-mono text-peregrine-200">
                      {row.remoteIp ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-xs text-peregrine-400">
                      {row.details ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-3">
      <div className="text-[11px] uppercase tracking-wider text-peregrine-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}
