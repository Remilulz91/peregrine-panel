import { useEffect, useState } from 'react';
import { api, ApiError, hasPermission, PERM, type ApiPlayerList } from '../lib/api';
import { useTranslation } from '../lib/i18n';

interface PlayerListProps {
  serverId: string;
  /** Whether the server is currently running. Drives the "offline" hint. */
  serverRunning: boolean;
  /** Used to gate the kick/ban buttons. */
  myPermissions: string[];
}

/**
 * Small per-server panel showing the online player list. Polls the
 * `/api/servers/:id/players` endpoint every 30 s. Hides itself when
 * the underlying template doesn't support RCON (Bedrock).
 *
 * v0.30.0+: if the viewer holds `players.manage`, each player pill
 * grows two small icon buttons:
 *   - kick: confirms with a prompt, asks the user for an optional
 *     reason, fires the RCON `kick` command.
 *   - ban: same UX but stronger — explicit `window.confirm` warns
 *     the action is permanent, then asks for an optional reason
 *     before firing the RCON `ban`.
 *
 * Both actions trigger an immediate re-poll so the pill disappears
 * from the list right away.
 */
export default function PlayerList({
  serverId,
  serverRunning,
  myPermissions,
}: PlayerListProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<ApiPlayerList | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canModerate = hasPermission(myPermissions, PERM.PLAYERS_MANAGE);

  async function reload(): Promise<void> {
    try {
      const result = await api.serverPlayers(serverId);
      setData(result);
    } catch {
      // Silent — keep the previous snapshot.
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const result = await api.serverPlayers(serverId);
        if (!cancelled) setData(result);
      } catch {
        // Silent.
      }
    }
    void load();
    const interval = setInterval(() => void load(), 30 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverId, serverRunning]);

  async function handleKick(name: string): Promise<void> {
    const reason = window.prompt(
      t('players.kickPrompt').replace('{name}', name),
      '',
    );
    if (reason === null) return; // user cancelled
    setBusy(name);
    setError(null);
    try {
      await api.kickPlayer(serverId, name, reason || undefined);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(null);
    }
  }

  async function handleBan(name: string): Promise<void> {
    if (!window.confirm(t('players.banConfirm').replace('{name}', name))) return;
    const reason = window.prompt(
      t('players.banPrompt').replace('{name}', name),
      '',
    );
    if (reason === null) return;
    setBusy(name);
    setError(null);
    try {
      await api.banPlayer(serverId, name, reason || undefined);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(null);
    }
  }

  // Don't render at all for Bedrock or anything else without RCON.
  if (!data || !data.supported) return null;

  return (
    <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white">
          {t('players.title')}
        </h3>
        <span className="font-mono text-xs text-peregrine-400">
          {t('players.count')
            .replace('{online}', String(data.online))
            .replace('{max}', String(data.max))}
        </span>
      </div>

      {error && (
        <p className="mt-2 text-xs text-rose-300">{error}</p>
      )}

      {!data.running ? (
        <p className="mt-3 text-xs italic text-peregrine-500">
          {t('players.offline')}
        </p>
      ) : data.players.length === 0 ? (
        <p className="mt-3 text-xs italic text-peregrine-500">
          {t('players.none')}
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {data.players.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1"
            >
              <span className="font-mono text-xs text-emerald-200">{name}</span>
              {canModerate && (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={busy === name}
                    onClick={() => void handleKick(name)}
                    title={t('players.kick')}
                    aria-label={t('players.kick')}
                    className="rounded border border-peregrine-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-peregrine-200 transition-colors hover:bg-peregrine-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('players.kick')}
                  </button>
                  <button
                    type="button"
                    disabled={busy === name}
                    onClick={() => void handleBan(name)}
                    title={t('players.ban')}
                    aria-label={t('players.ban')}
                    className="rounded border border-rose-500/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('players.ban')}
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
