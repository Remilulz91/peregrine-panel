import { useState, type FormEvent } from 'react';
import {
  api,
  ApiError,
  hasPermission,
  PERM,
  type ApiServer,
} from '../../lib/api';
import { navigate } from '../../lib/router';
import { useTranslation } from '../../lib/i18n';

interface SettingsPageProps {
  server: ApiServer;
  myPermissions: string[];
  onRenamed: (server: ApiServer) => void;
}

/**
 * Server-level settings. The Rename form is hidden when the viewer
 * lacks `settings.rename`. The Delete button is owner-only AND blocked
 * while the server is running.
 */
export default function SettingsPage({
  server,
  myPermissions,
  onRenamed,
}: SettingsPageProps) {
  const { t } = useTranslation();

  const [name, setName] = useState(server.name);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canRename = hasPermission(myPermissions, PERM.SETTINGS_RENAME);
  const isRunning = server.status === 'RUNNING';
  const isOwner = server.isOwner;

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

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('server.deleteConfirm'))) return;
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

  // Delete button: disabled if running OR not owner. The tooltip
  // explains the reason in either case.
  const deleteDisabled = !isOwner || isRunning || deleting;
  const deleteTooltip = !isOwner
    ? t('settings.deleteOwnerOnly')
    : isRunning
    ? t('settings.deleteBlocked')
    : undefined;

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold text-white">{t('settings.title')}</h2>

      {/* Rename ------------------------------------------------------- */}
      <div className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
        <h3 className="text-sm font-semibold text-white">
          {t('settings.renameTitle')}
        </h3>
        {canRename ? (
          <>
            <form
              onSubmit={handleRename}
              className="mt-4 flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[240px] flex-1">
                <label
                  htmlFor="rename-input"
                  className="mb-1 block text-xs font-medium text-peregrine-400"
                >
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
            {renameError && (
              <p className="mt-2 text-sm text-rose-400">{renameError}</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-peregrine-500">
            {t('settings.renameNoPermission')}
          </p>
        )}
      </div>

      {/* Danger zone -------------------------------------------------- */}
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
        <h3 className="text-sm font-semibold text-rose-300">
          {t('settings.dangerZone')}
        </h3>
        <p className="mt-2 text-sm text-peregrine-300">
          {t('settings.deleteHint')}
        </p>
        {!isOwner && (
          <p className="mt-2 text-sm text-peregrine-400">
            {t('settings.deleteOwnerOnly')}
          </p>
        )}
        {isOwner && isRunning && (
          <p className="mt-2 text-sm text-falcon">
            {t('settings.deleteBlocked')}
          </p>
        )}
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
