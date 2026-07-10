import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Field from './Field';
import {
  api,
  ApiError,
  BUILDTOOLS_LOADERS,
  filterVersionsForLoader,
  type ApiAdminUser,
  type ApiHostResources,
  type ApiTemplate,
  type ServerLoader,
} from '../lib/api';
import {
  HYBRID_LOADERS,
  MOD_LOADERS,
  PLUGIN_APIS,
  resolveLoader,
  type ModLoader,
  type PluginApi,
} from '../lib/loaderMatrix';
import { useAuth } from '../lib/auth';
import { useTranslation, type TranslationKey } from '../lib/i18n';

/**
 * v0.43.0+: `appearance-none` + custom SVG chevron so the trigger
 * is fully under our control (no OS-default arrow eating the
 * rounded-lg corners on the right side). The pop-up *list* of a
 * native <select> is still rendered by the OS — fully styling that
 * would require a custom popover + listbox component (planned for
 * a future release).
 */
const SELECT_CLASS =
  'w-full appearance-none rounded-lg border border-peregrine-700 bg-peregrine-950 bg-[length:14px_14px] bg-[right_0.75rem_center] bg-no-repeat px-3 py-2 pr-9 text-sm text-white outline-none transition-colors focus:border-falcon ' +
  'bg-[url("data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2020%2020%27%20fill%3D%27%237e8aa0%27%3E%3Cpath%20fill-rule%3D%27evenodd%27%20d%3D%27M5.23%207.21a.75.75%200%200%201%201.06.02L10%2011.06l3.71-3.83a.75.75%200%201%201%201.08%201.04l-4.25%204.39a.75.75%200%200%201-1.08%200L5.21%208.27a.75.75%200%200%201%20.02-1.06z%27%20clip-rule%3D%27evenodd%27%2F%3E%3C/svg%3E")]';

interface CreateServerDialogProps {
  templates: ApiTemplate[];
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Modal dialog for creating a new game server. The flow:
 *   1. Name
 *   2. Game (template) → drives whether the Loader picker appears
 *   3. Loader (Java only): Vanilla / Paper / Fabric / Forge
 *   4. Minecraft version (dropdown, list varies by game)
 *   5. Memory & CPU
 */
export default function CreateServerDialog({
  templates,
  onClose,
  onCreated,
}: CreateServerDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  // v0.43.0+: replaced the single `loader` state with the (modLoader,
  // pluginApi) pair. The resolved binary is computed in `loader`
  // below and submitted to the backend exactly like before — no
  // backend change.
  const [modLoader, setModLoader] = useState<ModLoader>('none');
  const [pluginApi, setPluginApi] = useState<PluginApi>('none');
  const loader: ServerLoader | null = useMemo(
    () => resolveLoader(modLoader, pluginApi),
    [modLoader, pluginApi],
  );
  // v0.12.0+: only admins reach this dialog (the button is hidden
  // for other users in Dashboard). We let the admin pick which user
  // will own the new server, defaulting to themselves.
  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  const [ownerId, setOwnerId] = useState<string>(user?.id ?? '');

  // v0.19.0+: fetch host resources once so we can show the available
  // RAM / CPU as live helper text under the inputs.
  const [hostResources, setHostResources] = useState<ApiHostResources | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    api
      .hostResources()
      .then((r) => {
        if (!cancelled) setHostResources(r.resources);
      })
      .catch(() => {
        // Silent — the form still works without the inline hint.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listAdminUsers()
      .then((result) => {
        if (!cancelled) setUsers(result.users);
      })
      .catch(() => {
        // Silently fall back to no list — the admin can still create
        // for themselves via the default ownerId.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [version, setVersion] = useState('LATEST');
  const [memoryMb, setMemoryMb] = useState(2048);
  const [cpuLimit, setCpuLimit] = useState(2);
  // v0.15.0+: optional disk quota. 0 = unlimited (no enforcement).
  const [diskQuotaMb, setDiskQuotaMb] = useState(0);
  // v0.14.0+: auto-start the server right after the install completes.
  // On by default to match Pterodactyl's UX.
  const [autostart, setAutostart] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-derive the per-template options whenever the user changes the
  // game. Bedrock has no loader concept and a much shorter version list.
  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl.id === templateId) ?? null,
    [templates, templateId],
  );
  const isJava = selectedTemplate?.kind === 'java';

  // v0.19.1+: Bedrock can only run the latest version (itzg pulls
  // from a Microsoft endpoint that doesn't serve older builds), so
  // when the user switches from Java → Bedrock we silently reset
  // the version to LATEST and hide the field.
  if (!isJava && version !== 'LATEST') {
    setVersion('LATEST');
  }

  // v0.41.1+: per-loader version list. Loader changes (via the
  // mod-loader / plugin-API <select>s below) reset the version to
  // LATEST inline when the current version isn't supported by the
  // new binary. Falls back to the Vanilla list when the user has
  // picked an unsupported (modLoader, pluginApi) combo — the
  // submit button is disabled in that state anyway.
  // v0.43.17+: fetch the full Mojang release list once when the dialog
  // opens and pass it through the loader-aware min-version filter.
  // Falls back to the bundled curated shortlist (mcVersionsFor) if
  // Mojang is unreachable — the user still gets a working picker.
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
    () => filterVersionsForLoader(loader ?? 'vanilla', allReleases),
    [loader, allReleases],
  );

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // v0.43.0+: Java requires a resolved binary; if the user picked
      // an unsupported combination (e.g. Forge + Paper), the loader
      // is null and the submit button should already be disabled —
      // belt-and-braces guard here too.
      if (isJava && loader === null) {
        setError(t('create.loaderInvalidCombination'));
        return;
      }
      await api.createServer({
        name,
        description: description.trim() || undefined,
        templateId,
        ownerId: ownerId || undefined,
        autostart,
        diskQuotaMb: diskQuotaMb > 0 ? diskQuotaMb : undefined,
        minecraftVersion: version,
        // The backend ignores the loader on Bedrock, but we send it
        // explicitly when the game is Java to keep the wire payload
        // predictable.
        loader: isJava ? (loader ?? 'vanilla') : 'vanilla',
        memoryMb,
        cpuLimit,
      });
      onCreated();
    } catch (err) {
      // The backend attaches the host snapshot on HTTP 507 from the
      // host-resources preflight; surface the real numbers instead of
      // a generic "Could not create" message.
      if (err instanceof ApiError && err.status === 507 && err.payload) {
        const payload = err.payload as { resources?: ApiHostResources };
        if (payload.resources) {
          setError(
            t('create.errorNotEnoughHost')
              .replace('{memMb}', String(payload.resources.allocatableMemMb))
              .replace('{cpuCount}', String(payload.resources.allocatableCpus)),
          );
        } else {
          setError(err.message);
        }
      } else if (err instanceof ApiError && err.payload) {
        // v0.19.2+: if the backend tagged the error with a `code`
        // starting with "version.", translate it locally so the user
        // sees an FR/EN message that matches the rest of the UI.
        const payload = err.payload as {
          code?: string;
          data?: { raw?: string; suggestion?: string };
        };
        if (payload.code && payload.code.startsWith('version.')) {
          const key =
            ('create.versionError.' + payload.code.slice('version.'.length)) as TranslationKey;
          const data = payload.data ?? {};
          setError(
            t(key)
              .replace('{raw}', data.raw ?? '')
              .replace('{suggestion}', data.suggestion ?? ''),
          );
        } else {
          setError(err.message || t('create.error'));
        }
      } else if (err instanceof ApiError && err.message) {
        setError(err.message);
      } else {
        setError(t('create.error'));
      }
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">{t('create.title')}</h2>

        <form className="mt-5" onSubmit={handleSubmit}>
          {/* v0.15.1+: two-column landscape layout. Collapses back to
              a single column on screens narrower than the md breakpoint
              (768 px) so phone users still get a usable dialog. */}
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
            {/* ---------- Left column — identity ---------- */}
            <div className="space-y-4">
              <Field
                id="srv-name"
                label={t('create.nameLabel')}
                type="text"
                required
                maxLength={48}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <div>
                <label
                  htmlFor="srv-description"
                  className="mb-1 block text-xs font-medium text-peregrine-400"
                >
                  {t('create.descriptionLabel')}
                </label>
                <textarea
                  id="srv-description"
                  rows={3}
                  maxLength={200}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full resize-none rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon"
                />
                <p className="mt-1 text-xs text-peregrine-600">
                  {t('create.descriptionHint')}
                </p>
              </div>

              <div>
                <label
                  htmlFor="srv-owner"
                  className="mb-1 block text-xs font-medium text-peregrine-400"
                >
                  {t('create.ownerLabel')}
                </label>
                <select
                  id="srv-owner"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {users.length === 0 && user && (
                    <option value={user.id}>{user.username}</option>
                  )}
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                      {u.id === user?.id ? ` (${t('create.ownerYou')})` : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-peregrine-600">
                  {t('create.ownerHint')}
                </p>
              </div>
            </div>

            {/* ---------- Right column — technical config ---------- */}
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="srv-template"
                  className="mb-1 block text-xs font-medium text-peregrine-400"
                >
                  {t('create.templateLabel')}
                </label>
                <select
                  id="srv-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              {/*
               * v0.43.0+: Java-only mod/plugin matrix. The user picks
               * a mod loader (left dropdown) and a plugin API (right
               * dropdown) independently; the panel resolves the
               * combination to one of the existing ServerLoader values
               * via loaderMatrix.ts. Invalid pairs (e.g. Forge +
               * Paper) disable the Create button.
               */}
              {isJava && (
                <div>
                  <p className="mb-1 block text-xs font-medium text-peregrine-400">
                    {t('create.loaderLabel')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="srv-mod-loader"
                        className="mb-1 block text-[11px] uppercase tracking-wider text-peregrine-500"
                      >
                        {t('create.modLoaderLabel')}
                      </label>
                      <select
                        id="srv-mod-loader"
                        value={modLoader}
                        onChange={(e) => {
                          const next = e.target.value as ModLoader;
                          setModLoader(next);
                          const resolved = resolveLoader(next, pluginApi);
                          if (
                            resolved !== null &&
                            !filterVersionsForLoader(resolved, allReleases).includes(version)
                          ) {
                            setVersion('LATEST');
                          }
                        }}
                        className={SELECT_CLASS}
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
                        htmlFor="srv-plugin-api"
                        className="mb-1 block text-[11px] uppercase tracking-wider text-peregrine-500"
                      >
                        {t('create.pluginApiLabel')}
                      </label>
                      <select
                        id="srv-plugin-api"
                        value={pluginApi}
                        onChange={(e) => {
                          const next = e.target.value as PluginApi;
                          setPluginApi(next);
                          const resolved = resolveLoader(modLoader, next);
                          if (
                            resolved !== null &&
                            !filterVersionsForLoader(resolved, allReleases).includes(version)
                          ) {
                            setVersion('LATEST');
                          }
                        }}
                        className={SELECT_CLASS}
                      >
                        {PLUGIN_APIS.map((p) => (
                          <option key={p} value={p}>
                            {t(`loader.plugin.${p}` as TranslationKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Resolved binary preview + warnings. */}
                  {loader === null ? (
                    <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-xs leading-snug text-rose-200">
                      {t('create.loaderInvalidCombination')}
                    </p>
                  ) : (
                    <>
                      <p className="mt-2 text-xs text-peregrine-500">
                        {t('create.loaderResolved').replace(
                          '{name}',
                          t(`loader.${loader}` as TranslationKey),
                        )}
                      </p>
                      {/*
                       * v0.41.0+: BuildTools warning (Bukkit / Spigot
                       * only). Compile on first start is ~5–15 min,
                       * ~1–2 GiB RAM.
                       */}
                      {BUILDTOOLS_LOADERS.has(loader) && (
                        <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-snug text-amber-200">
                          {t('loader.buildtoolsWarning')}
                        </p>
                      )}
                      {/*
                       * v0.43.0+: hybrid (mods + plugins) warning. These
                       * binaries are community-maintained and not
                       * officially endorsed by Paper / Forge upstream;
                       * a small fraction of plugins or mods may
                       * misbehave under them.
                       */}
                      {HYBRID_LOADERS.has(loader) && (
                        <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-snug text-amber-200">
                          {t('loader.hybridWarning')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {isJava && (
                <div>
                  <label
                    htmlFor="srv-version"
                    className="mb-1 block text-xs font-medium text-peregrine-400"
                  >
                    {t('create.versionLabel')}
                  </label>
                  {/*
                   * v0.41.1+: dropdown instead of free-text input. Each
                   * loader has its own supported-versions range
                   * (NeoForge starts at 1.20.1, Fabric at 1.14, etc.),
                   * so this list is rebuilt from `availableVersions`
                   * every time the user picks a different loader, and
                   * the selected version auto-resets to LATEST if it
                   * isn't in the new loader's range (see the useEffect
                   * above). Backend still validates against Mojang's
                   * manifest so a curated-list typo never lets through
                   * an invalid id.
                   */}
                  <select
                    id="srv-version"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    className={SELECT_CLASS}
                  >
                    {availableVersions.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-peregrine-500">
                    {t('create.versionHint')}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="srv-memory"
                    className="mb-1 block text-xs font-medium text-peregrine-400"
                  >
                    {t('create.memoryLabel')}
                  </label>
                  <input
                    id="srv-memory"
                    type="number"
                    min={512}
                    step="any"
                    value={memoryMb}
                    onChange={(e) =>
                      setMemoryMb(parseInt(e.target.value, 10) || 0)
                    }
                    className={SELECT_CLASS}
                  />
                  <p className="mt-1 text-xs text-peregrine-500">
                    {hostResources
                      ? t('create.memoryHint').replace(
                          '{availMb}',
                          String(hostResources.allocatableMemMb),
                        )
                      : t('create.memoryHintNoHost')}
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="srv-cpu"
                    className="mb-1 block text-xs font-medium text-peregrine-400"
                  >
                    {t('create.cpuLabel')}
                  </label>
                  <input
                    id="srv-cpu"
                    type="number"
                    min={0.5}
                    step="any"
                    value={cpuLimit}
                    onChange={(e) =>
                      setCpuLimit(parseFloat(e.target.value) || 0)
                    }
                    className={SELECT_CLASS}
                  />
                  <p className="mt-1 text-xs text-peregrine-500">
                    {hostResources
                      ? t('create.cpuHint').replace(
                          '{availCpu}',
                          String(hostResources.allocatableCpus),
                        )
                      : t('create.cpuHintNoHost')}
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="srv-quota"
                  className="mb-1 block text-xs font-medium text-peregrine-400"
                >
                  {t('create.diskQuotaLabel')}
                </label>
                <input
                  id="srv-quota"
                  type="number"
                  min={0}
                  max={1048576}
                  step={512}
                  value={diskQuotaMb}
                  onChange={(e) => setDiskQuotaMb(Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon"
                />
                <p className="mt-1 text-xs text-peregrine-600">
                  {t('create.diskQuotaHint')}
                </p>
              </div>
            </div>
          </div>

          {/* ---------- Full-width footer ---------- */}
          <div className="mt-5 space-y-4 border-t border-peregrine-800 pt-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-peregrine-200">
              <input
                type="checkbox"
                checked={autostart}
                onChange={(e) => setAutostart(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-falcon"
              />
              {t('create.autostartLabel')}
            </label>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-peregrine-700 px-4 py-2 text-sm font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy || (isJava && loader === null)}
                className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? t('common.pleaseWait') : t('create.submit')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
