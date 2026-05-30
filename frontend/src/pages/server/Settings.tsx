import { useEffect, useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  hasPermission,
  PERM,
  type ApiHostResources,
  type ApiServer,
} from '../../lib/api';
import { navigate } from '../../lib/router';
import { useAuth } from '../../lib/auth';
import { useTranslation, type TranslationKey } from '../../lib/i18n';

interface SettingsPageProps {
  server: ApiServer;
  myPermissions: string[];
  onRenamed: (server: ApiServer) => void;
}

function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : '{' + k + '}',
  );
}

export default function SettingsPage({
  server,
  myPermissions,
  onRenamed,
}: SettingsPageProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [name, setName] = useState(server.name);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [memMb, setMemMb] = useState(server.memoryMb);
  const [cpu, setCpu] = useState(server.cpuLimit);
  const [savingResources, setSavingResources] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [resourcesSavedAt, setResourcesSavedAt] = useState<number>(0);
  const [host, setHost] = useState<ApiHostResources | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!server.isOwner) return;
    api
      .hostResources()
      .then((r) => {
        if (!cancelled) setHost(r.resources);
      })
      .catch(() => {
        // silent
      });
    return () => {
      cancelled = true;
    };
  }, [server.id, resourcesSavedAt, server.isOwner]);

  const canRename = hasPermission(myPermissions, PERM.SETTINGS_RENAME);
  const isRunning = server.status === 'RUNNING';
  const isOwner = server.isOwner;

  const maxMem = host ? host.allocatableMemMb + server.memoryMb : 65536;
  const maxCpu = host ? host.allocatableCpus + server.cpuLimit : 64;

  async function handleRename(event: FormEvent): Promise<void> {
    event.preventDefault();
    setRenameError(null);
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === server.name) return;
    setRenaming(true);
    try {
      const result = await api.renameServer(server.id, trimmed);
      onRenamed(result.server);
    } catch (err) {
      setRenameError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setRenaming(false);
    }
  }

  async function handleResources(event: FormEvent): Promise<void> {
    event.preventDefault();
    setResourcesError(null);
    if (memMb === server.memoryMb && cpu === server.cpuLimit) return;
    if (isRunning) {
      setResourcesError(t('settings.resourcesNeedStop'));
      return;
    }
    setSavingResources(true);
    try {
      const result = await api.updateServerResources(server.id, memMb, cpu);
      onRenamed(result.server);
      setResourcesSavedAt(Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.payload) {
        const payload = err.payload as { resources?: ApiHostResources };
        if (payload.resources) {
          setResourcesError(
            fmt(t('settings.resourcesNotEnough'), {
              memMb: payload.resources.allocatableMemMb,
              cpuCount: payload.resources.allocatableCpus,
            }),
          );
          setSavingResources(false);
          return;
        }
      }
      setResourcesError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setSavingResources(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('server.deleteConfirm' as TranslationKey))) return;
    setDeleting(true);
    try {
      await api.deleteServer(server.id);
      navigate('/');
    } catch (err) {
      window.alert(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
      setDeleting(false);
    }
  }

  // v0.12.0+: deletion is administrator-only. Owners can still
  // rename, resize, start/stop, etc. — they just can't destroy.
  const deleteDisabled = !isAdmin || isRunning || deleting;
  const deleteTooltip = !isAdmin
    ? t('settings.deleteAdminOnly')
    : isRunning
    ? t('settings.deleteBlocked')
    : undefined;

  const resourcesUnchanged =
    memMb === server.memoryMb && cpu === server.cpuLimit;
  const resourcesDisabled =
    savingResources || resourcesUnchanged || isRunning;

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-white">{t('settings.title')}</h2>

      <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
        <h3 className="text-sm font-semibold text-white">{t('settings.renameTitle')}</h3>
        {canRename ? (
          <>
            <form onSubmit={handleRename} className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-[240px] flex-1">
                <label htmlFor="rename-input" className="mb-1 block text-xs font-medium text-peregrine-400">
                  {t('settings.renameLabel')}
                </label>
                <input
                  id="rename-input"
                  type="text"
                  required
                  maxLength={48}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon"
                />
              </div>
              <button
                type="submit"
                disabled={renaming || name.trim() === server.name}
                className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                {renaming ? t('common.pleaseWait') : t('settings.renameSave')}
              </button>
            </form>
            {renameError && <p className="mt-2 text-sm text-rose-400">{renameError}</p>}
          </>
        ) : (
          <p className="mt-3 text-sm text-peregrine-500">{t('settings.renameNoPermission')}</p>
        )}
      </div>

      {isOwner && (
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
          <h3 className="text-sm font-semibold text-white">{t('settings.resourcesTitle')}</h3>
          <p className="mt-1 text-sm text-peregrine-400">{t('settings.resourcesSubtitle')}</p>
          {isRunning && <p className="mt-3 text-sm text-falcon">{t('settings.resourcesNeedStop')}</p>}
          <form onSubmit={handleResources} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[160px]">
              <label htmlFor="mem-input" className="mb-1 block text-xs font-medium text-peregrine-400">
                {t('settings.resourcesMemLabel')}
              </label>
              <input
                id="mem-input"
                type="number"
                min={512}
                max={maxMem}
                step={256}
                value={memMb}
                disabled={isRunning}
                onChange={(e) => setMemMb(Number(e.target.value))}
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="min-w-[140px]">
              <label htmlFor="cpu-input" className="mb-1 block text-xs font-medium text-peregrine-400">
                {t('settings.resourcesCpuLabel')}
              </label>
              <input
                id="cpu-input"
                type="number"
                min={0.5}
                max={maxCpu}
                step={0.5}
                value={cpu}
                disabled={isRunning}
                onChange={(e) => setCpu(Number(e.target.value))}
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={resourcesDisabled}
              className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingResources ? t('common.pleaseWait') : t('settings.resourcesSave')}
            </button>
          </form>
          {resourcesError && <p className="mt-2 text-sm text-rose-400">{resourcesError}</p>}
          {resourcesSavedAt > 0 && !resourcesError && (
            <p className="mt-2 text-sm text-emerald-400">{t('settings.resourcesSaved')}</p>
          )}
          {host && (
            <div className="mt-4 space-y-1 text-xs text-peregrine-500">
              <p>
                {fmt(t('settings.resourcesHostUsage'), {
                  usedMem: host.allocatedMemMb,
                  totalMem: host.totalMemMb,
                  usedCpu: host.allocatedCpus,
                  totalCpu: host.totalCpus,
                })}
              </p>
              <p>
                {fmt(t('settings.resourcesReserve'), {
                  reservedMem: host.reservedMemMb,
                  reservedCpu: host.reservedCpus,
                })}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h3 className="text-sm font-semibold text-rose-300">{t('settings.dangerZone')}</h3>
        <p className="mt-2 text-sm text-peregrine-300">{t('settings.deleteHint')}</p>
        {!isAdmin && <p className="mt-2 text-sm text-peregrine-400">{t('settings.deleteAdminOnly')}</p>}
        {isAdmin && isRunning && <p className="mt-2 text-sm text-falcon">{t('settings.deleteBlocked')}</p>}
        <button
          type="button"
          disabled={deleteDisabled}
          onClick={() => void handleDelete()}
          title={deleteTooltip}
          className="mt-4 rounded-lg border border-rose-500/50 px-4 py-2 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? t('common.pleaseWait') : t('settings.delete')}
        </button>
      </div>
    </section>
  );
}
