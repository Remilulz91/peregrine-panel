import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  hasPermission,
  PERM,
  type ApiBannedIpEntry,
  type ApiBannedPlayerEntry,
  type ApiOpEntry,
  type ApiWhitelistEntry,
} from '../lib/api';
import { useTranslation, type TranslationKey } from '../lib/i18n';

/**
 * Whitelist / Ops / Banned-players / Banned-IPs management
 * (v0.29.0+). One section per list, internal tab navigation,
 * mounted below the Game settings form on the Game tab. Java only.
 *
 * Reads work whether the server is running or not (we just parse
 * the JSON files on disk). Writes go through RCON and therefore
 * require the server to be online — the backend returns 409
 * otherwise, which we surface as a friendly inline message.
 */
type ListKind = 'whitelist' | 'ops' | 'banned-players' | 'banned-ips';

interface PlayerAccessListsProps {
  serverId: string;
  myPermissions: string[];
}

const TABS: { kind: ListKind; labelKey: TranslationKey }[] = [
  { kind: 'whitelist', labelKey: 'access.tab.whitelist' },
  { kind: 'ops', labelKey: 'access.tab.ops' },
  { kind: 'banned-players', labelKey: 'access.tab.bannedPlayers' },
  { kind: 'banned-ips', labelKey: 'access.tab.bannedIps' },
];

export default function PlayerAccessLists({
  serverId,
  myPermissions,
}: PlayerAccessListsProps) {
  const { t } = useTranslation();
  const canEdit = hasPermission(myPermissions, PERM.PLAYERS_MANAGE);
  const [tab, setTab] = useState<ListKind>('whitelist');

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">
          {t('access.title')}
        </h2>
        <p className="mt-1 text-sm text-peregrine-400">
          {t('access.subtitle')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-peregrine-700">
        {TABS.map((tabDef) => (
          <button
            type="button"
            key={tabDef.kind}
            onClick={() => setTab(tabDef.kind)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === tabDef.kind
                ? 'border-falcon text-white'
                : 'border-transparent text-peregrine-400 hover:text-peregrine-200'
            }`}
          >
            {t(tabDef.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'whitelist' && (
        <WhitelistTab serverId={serverId} canEdit={canEdit} />
      )}
      {tab === 'ops' && <OpsTab serverId={serverId} canEdit={canEdit} />}
      {tab === 'banned-players' && (
        <BannedPlayersTab serverId={serverId} canEdit={canEdit} />
      )}
      {tab === 'banned-ips' && (
        <BannedIpsTab serverId={serverId} canEdit={canEdit} />
      )}
    </section>
  );
}

// --------------------------------------------------------------------
// Reusable bits
// --------------------------------------------------------------------

interface ListShellProps {
  empty: string;
  count: number;
  error: string | null;
  notice: string | null;
  children: React.ReactNode;
  form: React.ReactNode;
  canEdit: boolean;
}

function ListShell({ empty, count, error, notice, children, form, canEdit }: ListShellProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {!canEdit && (
        <p className="rounded-lg border border-peregrine-700 bg-peregrine-900 p-3 text-xs text-peregrine-400">
          {t('access.noPermission')}
        </p>
      )}
      {canEdit && form}
      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}
      {count === 0 ? (
        <p className="rounded-2xl border border-dashed border-peregrine-700 p-6 text-center text-sm text-peregrine-400">
          {empty}
        </p>
      ) : (
        <ul className="divide-y divide-peregrine-800 overflow-hidden rounded-2xl border border-peregrine-700 bg-peregrine-900">
          {children}
        </ul>
      )}
    </div>
  );
}

// --------------------------------------------------------------------
// Whitelist
// --------------------------------------------------------------------

function WhitelistTab({ serverId, canEdit }: { serverId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ApiWhitelistEntry[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const { entries: list } = await api.listWhitelist(serverId);
      setEntries(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await api.addWhitelist(serverId, name);
      setName('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(player: string) {
    setBusy(true);
    setError(null);
    try {
      await api.removeWhitelist(serverId, player);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ListShell
      empty={t('access.whitelist.empty')}
      count={entries.length}
      error={error}
      notice={null}
      canEdit={canEdit}
      form={
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.trim())}
            placeholder={t('access.namePlaceholder')}
            disabled={busy}
            className="flex-1 min-w-[180px] rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !name}
            className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('access.add')}
          </button>
        </form>
      }
    >
      {entries.map((e) => (
        <li
          key={e.uuid}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-white">{e.name}</p>
            <p className="text-xs text-peregrine-500">{e.uuid}</p>
          </div>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove(e.name)}
              className="rounded-lg border border-peregrine-700 px-3 py-1 text-xs font-medium text-peregrine-200 hover:bg-peregrine-800 disabled:opacity-50"
            >
              {t('access.remove')}
            </button>
          )}
        </li>
      ))}
    </ListShell>
  );
}

// --------------------------------------------------------------------
// Ops
// --------------------------------------------------------------------

function OpsTab({ serverId, canEdit }: { serverId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ApiOpEntry[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const { entries: list } = await api.listOps(serverId);
      setEntries(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await api.addOp(serverId, name);
      setName('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(player: string) {
    setBusy(true);
    setError(null);
    try {
      await api.removeOp(serverId, player);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ListShell
      empty={t('access.ops.empty')}
      count={entries.length}
      error={error}
      notice={null}
      canEdit={canEdit}
      form={
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.trim())}
            placeholder={t('access.namePlaceholder')}
            disabled={busy}
            className="flex-1 min-w-[180px] rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !name}
            className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('access.add')}
          </button>
        </form>
      }
    >
      {entries.map((e) => (
        <li
          key={e.uuid}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-white">
              {e.name}{' '}
              <span className="ml-1 text-xs text-peregrine-500">
                · {t('access.ops.level')} {e.level}
              </span>
            </p>
            <p className="text-xs text-peregrine-500">{e.uuid}</p>
          </div>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove(e.name)}
              className="rounded-lg border border-peregrine-700 px-3 py-1 text-xs font-medium text-peregrine-200 hover:bg-peregrine-800 disabled:opacity-50"
            >
              {t('access.remove')}
            </button>
          )}
        </li>
      ))}
    </ListShell>
  );
}

// --------------------------------------------------------------------
// Banned players
// --------------------------------------------------------------------

function BannedPlayersTab({ serverId, canEdit }: { serverId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ApiBannedPlayerEntry[]>([]);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const { entries: list } = await api.listBannedPlayers(serverId);
      setEntries(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await api.addBannedPlayer(serverId, name, reason || undefined);
      setName('');
      setReason('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(player: string) {
    setBusy(true);
    setError(null);
    try {
      await api.removeBannedPlayer(serverId, player);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ListShell
      empty={t('access.bannedPlayers.empty')}
      count={entries.length}
      error={error}
      notice={null}
      canEdit={canEdit}
      form={
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.trim())}
            placeholder={t('access.namePlaceholder')}
            disabled={busy}
            className="min-w-[160px] rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon disabled:opacity-50"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder={t('access.reasonPlaceholder')}
            disabled={busy}
            className="flex-1 min-w-[200px] rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !name}
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('access.ban')}
          </button>
        </form>
      }
    >
      {entries.map((e) => (
        <li key={e.uuid} className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">{e.name}</p>
            <p className="text-xs text-peregrine-500">
              {e.uuid} · {e.created}
            </p>
            {e.reason && (
              <p className="mt-1 text-xs text-peregrine-300">{e.reason}</p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove(e.name)}
              className="rounded-lg border border-peregrine-700 px-3 py-1 text-xs font-medium text-peregrine-200 hover:bg-peregrine-800 disabled:opacity-50"
            >
              {t('access.pardon')}
            </button>
          )}
        </li>
      ))}
    </ListShell>
  );
}

// --------------------------------------------------------------------
// Banned IPs
// --------------------------------------------------------------------

function BannedIpsTab({ serverId, canEdit }: { serverId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<ApiBannedIpEntry[]>([]);
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try {
      const { entries: list } = await api.listBannedIps(serverId);
      setEntries(list);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    if (!ip) return;
    setBusy(true);
    setError(null);
    try {
      await api.addBannedIp(serverId, ip, reason || undefined);
      setIp('');
      setReason('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(addr: string) {
    setBusy(true);
    setError(null);
    try {
      await api.removeBannedIp(serverId, addr);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ListShell
      empty={t('access.bannedIps.empty')}
      count={entries.length}
      error={error}
      notice={null}
      canEdit={canEdit}
      form={
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value.trim())}
            placeholder={t('access.ipPlaceholder')}
            disabled={busy}
            className="min-w-[160px] rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon disabled:opacity-50"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder={t('access.reasonPlaceholder')}
            disabled={busy}
            className="flex-1 min-w-[200px] rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !ip}
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('access.ban')}
          </button>
        </form>
      }
    >
      {entries.map((e) => (
        <li key={e.ip} className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white">{e.ip}</p>
            <p className="text-xs text-peregrine-500">{e.created}</p>
            {e.reason && (
              <p className="mt-1 text-xs text-peregrine-300">{e.reason}</p>
            )}
          </div>
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove(e.ip)}
              className="rounded-lg border border-peregrine-700 px-3 py-1 text-xs font-medium text-peregrine-200 hover:bg-peregrine-800 disabled:opacity-50"
            >
              {t('access.pardon')}
            </button>
          )}
        </li>
      ))}
    </ListShell>
  );
}
