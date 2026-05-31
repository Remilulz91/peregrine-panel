import { useEffect, useState } from 'react';
import { api, type ApiPlayerList } from '../lib/api';
import { useTranslation } from '../lib/i18n';

interface PlayerListProps {
  serverId: string;
  /** Whether the server is currently running. Drives the "offline" hint. */
  serverRunning: boolean;
}

/**
 * Small per-server panel showing the online player list. Polls the
 * `/api/servers/:id/players` endpoint every 30 s. Hides itself when
 * the underlying template doesn't support RCON (Bedrock).
 *
 * Mounted on the Console tab so it sits naturally near the live
 * server output the user is already watching.
 */
export default function PlayerList({
  serverId,
  serverRunning,
}: PlayerListProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<ApiPlayerList | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const result = await api.serverPlayers(serverId);
        if (!cancelled) setData(result);
      } catch {
        // Silent — keep the previous snapshot.
      }
    }

    void load();
    const interval = setInterval(() => void load(), 30 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverId, serverRunning]);

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

      {!data.running ? (
        <p className="mt-3 text-xs italic text-peregrine-500">
          {t('players.offline')}
        </p>
      ) : data.players.length === 0 ? (
        <p className="mt-3 text-xs italic text-peregrine-500">
          {t('players.none')}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.players.map((name) => (
            <span
              key={name}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs text-emerald-200"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
