import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import {
  api,
  ApiError,
  hasPermission,
  BUILDTOOLS_LOADERS,
  filterVersionsForLoader,
  PERM,
  type ApiHostResources,
  type ApiServer,
  type ApiTemplate,
  type ServerLoader,
} from '../../lib/api';
import {
  HYBRID_LOADERS,
  MOD_LOADERS,
  PLUGIN_APIS,
  resolveLoader,
  splitLoader,
  type ModLoader,
  type PluginApi,
} from '../../lib/loaderMatrix';
import { navigate } from '../../lib/router';
import { useAuth } from '../../lib/auth';
import { useTranslation, type TranslationKey } from '../../lib/i18n';

interface SettingsPageProps {
  server: ApiServer;
  /** Null while the parent is still loading templates. Drives Java vs Bedrock UI. */
  template: ApiTemplate | null;
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
  template,
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

  const [description, setDescription] = useState(server.description);
  const [savingDescription, setSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  // v0.17.0+: server icon upload (PNG, ≤256 KB).
  const iconInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);

  const [memMb, setMemMb] = useState(server.memoryMb);
  const [cpu, setCpu] = useState(server.cpuLimit);
  const [savingResources, setSavingResources] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [resourcesSavedAt, setResourcesSavedAt] = useState<number>(0);

  const [diskQuota, setDiskQuota] = useState(server.diskQuotaMb ?? 0);

  // v0.31.0+: version / loader change on an existing server. Recreates
  // the container; world / mods / config are preserved on disk.
  // v0.43.0+: derive the (modLoader, pluginApi) pair from the saved
  // server.loader so the two dropdowns initialise correctly. The
  // resolved binary is recomputed from the current dropdown state.
  const initialSplit = splitLoader(server.loader);
  const [modLoader, setModLoader] = useState<ModLoader>(initialSplit.modLoader);
  const [pluginApi, setPluginApi] = useState<PluginApi>(initialSplit.pluginApi);
  const versionLoader: ServerLoader | null = useMemo(
    () => resolveLoader(modLoader, pluginApi),
    [modLoader, pluginApi],
  );
  const [versionString, setVersionString] = useState(server.minecraftVersion);

  // v0.41.1+: dropdown of versions supported by the current loader.
  // We deliberately do NOT useEffect-reset on (versionLoader,
  // versionString) — on initial mount, if the server runs a version
  // older than the curated floor (e.g. Fabric 1.15.2 — predates our
  // 1.16.5 cut-off), we want to keep showing the live value, not
  // silently snap it to LATEST. Instead, the loader <select> handles
  // the version reset inline (see onChange handler in the JSX).
  // v0.43.17+: fetch the full Mojang release list once on mount and
  // filter per loader min-version. Falls back to mcVersionsFor if
  // Mojang is unreachable so the dropdown still populates.
  const [allReleases, setAllReleases] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .listMinecraftVersions()
      .then((r) => {
        if (!cancelled) setAllReleases(r.releases);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const availableVersions = useMemo(
    () =>
      filterVersionsForLoader(versionLoader ?? server.loader, allReleases),
    [versionLoader, server.loader, allReleases],
  );
  const [savingVersion, setSavingVersion] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionSavedAt, setVersionSavedAt] = useState<number>(0);
  const [savingDiskQuota, setSavingDiskQuota] = useState(false);
  const [diskQuotaError, setDiskQuotaError] = useState<string | null>(null);
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
  // v0.32.0+: `isOwner` was used to gate the Resources section; that
  // section is now admin-only, so the local helper is dropped to keep
  // the type-checker happy. The host-resource fetch effect still uses
  // `server.isOwner` directly above to skip the call for non-owners.


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

  async function handleDescription(event: FormEvent): Promise<void> {
    event.preventDefault();
    setDescriptionError(null);
    const trimmed = description.trim();
    if (trimmed === server.description) return;
    setSavingDescription(true);
    try {
      const result = await api.updateServerDescription(server.id, trimmed);
      onRenamed(result.server);
    } catch (err) {
      setDescriptionError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setSavingDescription(false);
    }
  }

  async function handleIconPicked(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    setIconError(null);
    const file = event.target.files?.[0];
    // Clear the input so picking the same file twice still fires a change.
    event.target.value = '';
    if (!file) return;
    if (file.type && file.type !== 'image/png') {
      setIconError(t('settings.iconWrongType'));
      return;
    }
    if (file.size > 256 * 1024) {
      setIconError(t('settings.iconTooLarge'));
      return;
    }
    setUploadingIcon(true);
    try {
      await api.uploadServerIcon(server.id, file);
      // Refetch the server record so hasIcon / iconUpdatedAt are fresh.
      const refreshed = await api.getServer(server.id);
      onRenamed(refreshed.server);
    } catch (err) {
      setIconError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setUploadingIcon(false);
    }
  }

  async function handleIconDelete(): Promise<void> {
    setIconError(null);
    setUploadingIcon(true);
    try {
      await api.deleteServerIcon(server.id);
      const refreshed = await api.getServer(server.id);
      onRenamed(refreshed.server);
    } catch (err) {
      setIconError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setUploadingIcon(false);
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

  async function handleVersionChange(event: FormEvent): Promise<void> {
    event.preventDefault();
    setVersionError(null);
    const trimmedVersion = versionString.trim();
    if (!trimmedVersion) {
      setVersionError(t('settings.version.emptyVersion'));
      return;
    }
    if (
      trimmedVersion === server.minecraftVersion &&
      versionLoader === server.loader
    ) {
      return;
    }
    // v0.43.0+: belt-and-braces guard — the Save button is also
    // disabled when versionLoader is null, but make sure no one
    // bypasses by submitting the form via Enter.
    if (versionLoader === null) {
      setVersionError(t('create.loaderInvalidCombination'));
      return;
    }
    if (!window.confirm(t('settings.version.confirm'))) return;
    setSavingVersion(true);
    try {
      const result = await api.updateServerVersion(
        server.id,
        trimmedVersion,
        versionLoader,
      );
      onRenamed(result.server);
      setVersionSavedAt(Date.now());
    } catch (err) {
      setVersionError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setSavingVersion(false);
    }
  }

  async function handleDiskQuota(event: FormEvent): Promise<void> {
    event.preventDefault();
    setDiskQuotaError(null);
    const target = Math.max(0, Math.floor(diskQuota));
    if (target === (server.diskQuotaMb ?? 0)) return;
    setSavingDiskQuota(true);
    try {
      const result = await api.updateServerDiskQuota(server.id, target);
      onRenamed(result.server);
    } catch (err) {
      setDiskQuotaError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setSavingDiskQuota(false);
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

      {/* Description — same permission as rename (cosmetic owner metadata). */}
      {canRename && (
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
          <h3 className="text-sm font-semibold text-white">{t('settings.descriptionTitle')}</h3>
          <p className="mt-1 text-sm text-peregrine-400">{t('settings.descriptionSubtitle')}</p>
          <form onSubmit={handleDescription} className="mt-4 space-y-3">
            <textarea
              id="description-input"
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('settings.descriptionPlaceholder')}
              className="w-full resize-none rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-peregrine-600 focus:border-falcon"
            />
            <button
              type="submit"
              disabled={savingDescription || description.trim() === server.description}
              className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingDescription ? t('common.pleaseWait') : t('settings.descriptionSave')}
            </button>
          </form>
          {descriptionError && <p className="mt-2 text-sm text-rose-400">{descriptionError}</p>}
        </div>
      )}

      {/* Server icon (v0.17.0+). Same permission as rename. PNG, ≤256 KB.
          The current icon is shown if any; otherwise a tiny placeholder
          tells the user the slot is empty. */}
      {canRename && (
        <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
          <h3 className="text-sm font-semibold text-white">{t('settings.iconTitle')}</h3>
          <p className="mt-1 text-sm text-peregrine-400">{t('settings.iconSubtitle')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {api.serverIconUrl(server) ? (
              <img
                src={api.serverIconUrl(server) ?? undefined}
                alt=""
                className="h-16 w-16 rounded-xl border border-peregrine-700 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-peregrine-700 text-xs text-peregrine-500">
                {t('settings.iconNone')}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input
                ref={iconInputRef}
                type="file"
                accept="image/png"
                className="hidden"
                onChange={(e) => void handleIconPicked(e)}
              />
              <button
                type="button"
                disabled={uploadingIcon}
                onClick={() => iconInputRef.current?.click()}
                className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadingIcon ? t('common.pleaseWait') : t('settings.iconUpload')}
              </button>
              {server.hasIcon && (
                <button
                  type="button"
                  disabled={uploadingIcon}
                  onClick={() => void handleIconDelete()}
                  className="rounded-lg border border-peregrine-700 px-4 py-2 text-sm font-semibold text-peregrine-200 transition-colors hover:bg-peregrine-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('settings.iconRemove')}
                </button>
              )}
            </div>
          </div>
          {iconError && <p className="mt-2 text-sm text-rose-400">{iconError}</p>}
        </div>
      )}

      {/* v0.32.0+: Resources section is admin-only. Non-admin users
          must not see CPU/RAM limits — both for security (info-leak
          about host capacity) and because the API rejects changes
          from non-admins anyway. */}
      {isAdmin && (
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

      {/* v0.31.0+: change the Minecraft version and/or loader on an
          existing server. The container is destroyed and recreated;
          world / mods / config are preserved on the data volume. */}
      <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
        <h3 className="text-sm font-semibold text-white">{t('settings.version.title')}</h3>
        <p className="mt-1 text-sm text-peregrine-400">{t('settings.version.subtitle')}</p>
        <p className="mt-2 text-xs text-amber-300/90">{t('settings.version.warning')}</p>
        {isRunning && (
          <p className="mt-3 text-sm text-falcon">{t('settings.version.needStop')}</p>
        )}
        {!hasPermission(myPermissions, PERM.SETTINGS_VERSION) ? (
          <p className="mt-3 text-sm text-peregrine-400">
            {t('settings.version.noPermission')}
          </p>
        ) : (
          <form
            onSubmit={handleVersionChange}
            className="mt-4 flex flex-wrap items-end gap-3"
          >
            {/*
             * v0.43.0+: two-dropdown loader matrix. Mirrors the create
             * dialog so the user has one mental model across the
             * panel. splitLoader() reverse-maps the existing
             * server.loader into (modLoader, pluginApi) on mount; both
             * sub-selects share the appearance-none + custom chevron
             * styling defined at the top of CreateServerDialog.tsx.
             */}
            {template?.kind === 'java' && (
              <div className="w-full">
                <p className="mb-1 block text-xs font-medium text-peregrine-400">
                  {t('create.loaderLabel')}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="version-mod-loader"
                      className="mb-1 block text-[11px] uppercase tracking-wider text-peregrine-500"
                    >
                      {t('create.modLoaderLabel')}
                    </label>
                    <select
                      id="version-mod-loader"
                      value={modLoader}
                      disabled={savingVersion || isRunning}
                      onChange={(e) => {
                        const next = e.target.value as ModLoader;
                        setModLoader(next);
                        const resolved = resolveLoader(next, pluginApi);
                        if (
                          resolved !== null &&
                          !filterVersionsForLoader(resolved, allReleases).includes(versionString)
                        ) {
                          setVersionString('LATEST');
                        }
                      }}
                      className="w-full appearance-none rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 pr-9 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {MOD_LOADERS.map((m) => (
                        <option key={m} value={m}>
                          {t(`loader.mod.${m}` as TranslationKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="version-plugin-api"
                      className="mb-1 block text-[11px] uppercase tracking-wider text-peregrine-500"
                    >
                      {t('create.pluginApiLabel')}
                    </label>
                    <select
                      id="version-plugin-api"
                      value={pluginApi}
                      disabled={savingVersion || isRunning}
                      onChange={(e) => {
                        const next = e.target.value as PluginApi;
                        setPluginApi(next);
                        const resolved = resolveLoader(modLoader, next);
                        if (
                          resolved !== null &&
                          !filterVersionsForLoader(resolved, allReleases).includes(versionString)
                        ) {
                          setVersionString('LATEST');
                        }
                      }}
                      className="w-full appearance-none rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 pr-9 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {PLUGIN_APIS.map((p) => (
                        <option key={p} value={p}>
                          {t(`loader.plugin.${p}` as TranslationKey)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {versionLoader === null ? (
                  <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs leading-snug text-rose-200">
                    {t('create.loaderInvalidCombination')}
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-peregrine-500">
                      {t('create.loaderResolved').replace(
                        '{name}',
                        t(`loader.${versionLoader}` as TranslationKey),
                      )}
                    </p>
                    {BUILDTOOLS_LOADERS.has(versionLoader) && (
                      <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-snug text-amber-200">
                        {t('loader.buildtoolsWarning')}
                      </p>
                    )}
                    {HYBRID_LOADERS.has(versionLoader) && (
                      <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-snug text-amber-200">
                        {t('loader.hybridWarning')}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="min-w-[180px] flex-1">
              <label
                htmlFor="version-input"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('settings.version.versionLabel')}
              </label>
              {/*
               * v0.41.1+: select instead of free-text input. Options
               * track the loader's supported-versions range; the
               * useEffect above resets to LATEST if the user picks a
               * loader that doesn't support the previously-selected
               * version. The current server's version is force-added
               * to the list if missing so the operator always sees
               * the live value selected — useful when the server is
               * running a build older than the curated floor.
               */}
              <select
                id="version-input"
                value={versionString}
                disabled={savingVersion || isRunning}
                onChange={(e) => setVersionString(e.target.value)}
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
              >
                {(availableVersions.includes(versionString)
                  ? availableVersions
                  : [versionString, ...availableVersions]
                ).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={
                savingVersion ||
                isRunning ||
                versionLoader === null ||
                (versionString.trim() === server.minecraftVersion &&
                  versionLoader === server.loader)
              }
              className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingVersion
                ? t('settings.version.applying')
                : t('settings.version.apply')}
            </button>
          </form>
        )}
        {versionError && (
          <p className="mt-3 text-sm text-rose-400">{versionError}</p>
        )}
        {versionSavedAt > 0 && !versionError && (
          <p className="mt-3 text-sm text-emerald-300">
            {t('settings.version.saved')}
          </p>
        )}
      </div>

      {/* v0.32.0+: Disk usage section is now admin-only. Users
          should not see the server's disk footprint or quota — it
          leaks hosting info that has no value for end users. */}
      {isAdmin && (
        <>
      <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
        <h3 className="text-sm font-semibold text-white">{t('settings.diskTitle')}</h3>
        <p className="mt-1 text-sm text-peregrine-400">{t('settings.diskSubtitle')}</p>

        {/* Usage indicator: bar when a quota is set, plain text otherwise. */}
        {server.diskQuotaMb !== null ? (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-baseline justify-between text-xs text-peregrine-300">
              <span>
                {fmt(t('settings.diskUsedOfQuota'), {
                  used: server.diskUsedMb,
                  quota: server.diskQuotaMb,
                  pct: Math.min(
                    100,
                    Math.round((server.diskUsedMb / server.diskQuotaMb) * 100),
                  ),
                })}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-peregrine-800">
              <div
                className={
                  server.diskUsedMb > server.diskQuotaMb
                    ? 'h-full rounded-full bg-rose-500'
                    : server.diskUsedMb / server.diskQuotaMb > 0.8
                    ? 'h-full rounded-full bg-falcon'
                    : 'h-full rounded-full bg-emerald-500'
                }
                style={{
                  width: `${Math.min(100, Math.round((server.diskUsedMb / server.diskQuotaMb) * 100))}%`,
                }}
              />
            </div>
            {server.diskUsedMb > server.diskQuotaMb && (
              <p className="text-xs text-rose-400">{t('settings.diskExceeded')}</p>
            )}
          </div>
        ) : (
          <div className="mt-4 text-sm text-peregrine-300">
            <p>{fmt(t('settings.diskUsed'), { used: server.diskUsedMb })}</p>
            <p className="mt-1 text-xs text-peregrine-500">{t('settings.diskNoQuota')}</p>
          </div>
        )}

        {/* Admin-only quota editor. */}
        {isAdmin ? (
          <form onSubmit={handleDiskQuota} className="mt-5 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px]">
              <label
                htmlFor="disk-quota-input"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('settings.diskQuotaLabel')}
              </label>
              <input
                id="disk-quota-input"
                type="number"
                min={0}
                max={1048576}
                step={512}
                value={diskQuota}
                onChange={(e) => setDiskQuota(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon"
              />
            </div>
            <button
              type="submit"
              disabled={savingDiskQuota || diskQuota === (server.diskQuotaMb ?? 0)}
              className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingDiskQuota ? t('common.pleaseWait') : t('settings.diskQuotaSave')}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-xs text-peregrine-500">{t('settings.diskQuotaAdminOnly')}</p>
        )}
        {diskQuotaError && <p className="mt-2 text-sm text-rose-400">{diskQuotaError}</p>}
      </div>
        </>
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
