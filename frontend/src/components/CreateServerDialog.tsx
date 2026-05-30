import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Field from './Field';
import {
  api,
  ApiError,
  BEDROCK_MC_VERSIONS,
  JAVA_LOADERS,
  JAVA_MC_VERSIONS,
  type ApiAdminUser,
  type ApiHostResources,
  type ApiTemplate,
  type ServerLoader,
} from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation, type TranslationKey } from '../lib/i18n';

// Memory amounts (in MB) offered when creating a server.
const MEMORY_OPTIONS = [1024, 2048, 4096, 8192];

// CPU limits (in cores) offered when creating a server. 0.5 is
// available for small VPS where a full core is too much.
const CPU_OPTIONS = [0.5, 1, 2, 4];

const SELECT_CLASS =
  'w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon';

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
  const [loader, setLoader] = useState<ServerLoader>('vanilla');
  // v0.12.0+: only admins reach this dialog (the button is hidden
  // for other users in Dashboard). We let the admin pick which user
  // will own the new server, defaulting to themselves.
  const [users, setUsers] = useState<ApiAdminUser[]>([]);
  const [ownerId, setOwnerId] = useState<string>(user?.id ?? '');

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Re-derive the per-template options whenever the user changes the
  // game. Bedrock has no loader concept and a much shorter version list.
  const selectedTemplate = useMemo(
    () => templates.find((tpl) => tpl.id === templateId) ?? null,
    [templates, templateId],
  );
  const isJava = selectedTemplate?.kind === 'java';
  const versionOptions = isJava ? JAVA_MC_VERSIONS : BEDROCK_MC_VERSIONS;

  // If the chosen version is not in the new game's list (e.g. user
  // picked Bedrock after picking a Java-only version), snap back to the
  // first valid option to avoid sending nonsense to the backend.
  if (!versionOptions.includes(version)) {
    setVersion(versionOptions[0]);
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.createServer({
        name,
        description: description.trim() || undefined,
        templateId,
        ownerId: ownerId || undefined,
        minecraftVersion: version,
        // The backend ignores the loader on Bedrock, but we send it
        // explicitly when the game is Java to keep the wire payload
        // predictable.
        loader: isJava ? loader : 'vanilla',
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
        className="w-full max-w-md rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-white">{t('create.title')}</h2>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          <Field
            id="srv-name"
            label={t('create.nameLabel')}
            type="text"
            required
            maxLength={48}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          {/* Optional description — free text, shown under the name. */}
          <div>
            <label
              htmlFor="srv-description"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('create.descriptionLabel')}
            </label>
            <textarea
              id="srv-description"
              rows={2}
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon"
            />
            <p className="mt-1 text-xs text-peregrine-600">
              {t('create.descriptionHint')}
            </p>
          </div>

          {/* Owner picker — admins create servers on behalf of users. */}
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

          {/* Loader is Java-only — Bedrock has no fork ecosystem. */}
          {isJava && (
            <div>
              <label
                htmlFor="srv-loader"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('create.loaderLabel')}
              </label>
              <select
                id="srv-loader"
                value={loader}
                onChange={(e) => setLoader(e.target.value as ServerLoader)}
                className={SELECT_CLASS}
              >
                {JAVA_LOADERS.map((l) => (
                  <option key={l} value={l}>
                    {t((`loader.${l}` as TranslationKey))}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-peregrine-600">
                {t('create.loaderHint')}
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="srv-version"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('create.versionLabel')}
            </label>
            <select
              id="srv-version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className={SELECT_CLASS}
            >
              {versionOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="srv-memory"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('create.memoryLabel')}
              </label>
              <select
                id="srv-memory"
                value={memoryMb}
                onChange={(e) => setMemoryMb(Number(e.target.value))}
                className={SELECT_CLASS}
              >
                {MEMORY_OPTIONS.map((mb) => (
                  <option key={mb} value={mb}>
                    {mb / 1024} GB
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="srv-cpu"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('create.cpuLabel')}
              </label>
              <select
                id="srv-cpu"
                value={cpuLimit}
                onChange={(e) => setCpuLimit(Number(e.target.value))}
                className={SELECT_CLASS}
              >
                {CPU_OPTIONS.map((cores) => (
                  <option key={cores} value={cores}>
                    {cores}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-peregrine-700 px-4 py-2 text-sm font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('common.pleaseWait') : t('create.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
