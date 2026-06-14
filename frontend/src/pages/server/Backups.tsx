import { useCallback, useEffect, useState, type FormEvent } from 'react';
import DiskUsageBar from '../../components/DiskUsageBar';
import {
  api,
  ApiError,
  hasPermission,
  PERM,
  type ApiBackup,
  type ApiDiskUsage,
  type ApiServer,
} from '../../lib/api';
import { useTranslation } from '../../lib/i18n';

interface BackupsPageProps {
  server: ApiServer;
  myPermissions: string[];
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

function formatWhen(iso: string, locale: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : iso.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US');
}

/**
 * Backup management for one server. Each action is gated by the
 * corresponding `backups.*` permission:
 *   - create: hidden unless backups.create
 *   - restore: hidden unless backups.restore (and server not running)
 *   - delete: hidden unless backups.delete
 *   - download: hidden unless backups.download
 */
export default function BackupsPage({
  server,
  myPermissions,
}: BackupsPageProps) {
  const { t, language } = useTranslation();

  const [backups, setBackups] = useState<ApiBackup[]>([]);
  const [max, setMax] = useState<number>(5);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [usage, setUsage] = useState<ApiDiskUsage | null>(null);

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // v0.36.0 — Picocrypt-format encrypted download dialog state.
  const [encryptBackup, setEncryptBackup] = useState<ApiBackup | null>(null);
  const [encryptPassword, setEncryptPassword] = useState('');
  const [encryptConfirm, setEncryptConfirm] = useState('');
  const [encrypting, setEncrypting] = useState(false);
  const [encryptError, setEncryptError] = useState<string | null>(null);

  const canCreate = hasPermission(myPermissions, PERM.BACKUPS_CREATE);
  const canRestorePerm = hasPermission(myPermissions, PERM.BACKUPS_RESTORE);
  const canDelete = hasPermission(myPermissions, PERM.BACKUPS_DELETE);
  const canDownload = hasPermission(myPermissions, PERM.BACKUPS_DOWNLOAD);

  const load = useCallback(async () => {
    try {
      const result = await api.listBackups(server.id);
      setBackups(result.backups);
      setMax(result.max);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
    try {
      const result = await api.diskUsage();
      setUsage(result.usage);
    } catch {
      // non-critical
    }
  }, [server.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.createBackup(server.id, name.trim());
      setName('');
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 507) {
        setCreateError(t('backups.diskFull'));
      } else {
        setCreateError(
          err instanceof ApiError ? err.message : t('common.errorGeneric'),
        );
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(backup: ApiBackup): Promise<void> {
    if (server.status === 'RUNNING') {
      window.alert(t('backups.restoreBlocked'));
      return;
    }
    if (!window.confirm(t('backups.restoreConfirm'))) return;
    try {
      await api.restoreBackup(server.id, backup.id);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : t('common.errorGeneric');
      window.alert(message);
    }
  }

  function openEncryptDialog(backup: ApiBackup): void {
    setEncryptBackup(backup);
    setEncryptPassword('');
    setEncryptConfirm('');
    setEncryptError(null);
  }

  function closeEncryptDialog(): void {
    if (encrypting) return; // don't allow cancel while crypto is running
    setEncryptBackup(null);
    setEncryptPassword('');
    setEncryptConfirm('');
    setEncryptError(null);
  }

  async function handleEncryptedDownload(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!encryptBackup) return;
    setEncryptError(null);

    if (encryptPassword.length < 8) {
      setEncryptError(t('backups.encryptPasswordTooShort'));
      return;
    }
    if (encryptPassword !== encryptConfirm) {
      setEncryptError(t('backups.encryptPasswordMismatch'));
      return;
    }

    setEncrypting(true);
    try {
      const { blob, filename } = await api.downloadBackupEncrypted(
        server.id,
        encryptBackup.id,
        encryptPassword,
      );
      // Trigger browser save via a synthetic anchor click.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setEncryptBackup(null);
      setEncryptPassword('');
      setEncryptConfirm('');
    } catch (err) {
      setEncryptError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setEncrypting(false);
    }
  }

  async function handleDelete(backup: ApiBackup): Promise<void> {
    if (!window.confirm(t('backups.deleteConfirm'))) return;
    try {
      await api.deleteBackup(server.id, backup.id);
    } catch (err) {
      window.alert(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    }
    await load();
  }

  const subtitle = t('backups.subtitle').replace('{max}', String(max));
  const canRestoreNow = canRestorePerm && server.status !== 'RUNNING';

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">{t('backups.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-peregrine-400">{subtitle}</p>
      </div>

      {usage && <DiskUsageBar usage={usage} />}

      {canCreate ? (
        <form
          onSubmit={handleCreate}
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-peregrine-700 bg-peregrine-900 p-3"
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('backups.namePlaceholder')}
            maxLength={64}
            className="min-w-[200px] flex-1 rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-peregrine-600 focus:border-falcon"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? t('backups.creating') : t('backups.create')}
          </button>
        </form>
      ) : (
        <p className="rounded-2xl border border-peregrine-700 bg-peregrine-900 p-3 text-center text-xs text-peregrine-500">
          {t('backups.noCreatePerm')}
        </p>
      )}

      {createError && <p className="text-sm text-rose-400">{createError}</p>}
      {loadError && (
        <p className="text-sm text-rose-400">{t('backups.loadError')}</p>
      )}

      {!loaded ? null : backups.length === 0 && !loadError ? (
        <div className="rounded-2xl border border-dashed border-peregrine-700 p-8 text-center text-sm text-peregrine-400">
          {t('backups.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-peregrine-700">
          <table className="min-w-full divide-y divide-peregrine-800 text-sm">
            <thead className="bg-peregrine-900 text-left text-xs uppercase tracking-wider text-peregrine-400">
              <tr>
                <th className="px-4 py-2">{t('backups.colName')}</th>
                <th className="px-4 py-2">{t('backups.colSize')}</th>
                <th className="px-4 py-2">{t('backups.colCreated')}</th>
                <th className="px-4 py-2 text-right">
                  {t('backups.colActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-peregrine-800 text-peregrine-200">
              {backups.map((backup) => (
                <tr key={backup.id}>
                  <td className="px-4 py-2 font-medium text-white">
                    {backup.name}
                  </td>
                  <td className="px-4 py-2 text-peregrine-300">
                    {formatBytes(backup.sizeBytes)}
                  </td>
                  <td className="px-4 py-2 text-xs text-peregrine-300">
                    {formatWhen(backup.createdAt, language)}
                    {backup.createdByUsername && (
                      <span className="text-peregrine-500">
                        {' '}
                        · {backup.createdByUsername}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      {canDownload && (
                        <a
                          href={api.backupDownloadUrl(server.id, backup.id)}
                          className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
                        >
                          {t('backups.download')}
                        </a>
                      )}
                      {canDownload && (
                        <button
                          type="button"
                          onClick={() => openEncryptDialog(backup)}
                          title={t('backups.encryptHint')}
                          className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-falcon transition-colors hover:bg-peregrine-800"
                        >
                          {t('backups.encryptDownload')}
                        </button>
                      )}
                      {canRestorePerm && (
                        <button
                          type="button"
                          disabled={!canRestoreNow}
                          onClick={() => void handleRestore(backup)}
                          title={
                            canRestoreNow ? undefined : t('backups.restoreBlocked')
                          }
                          className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {t('backups.restore')}
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(backup)}
                          className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
                        >
                          {t('backups.delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {encryptBackup && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={closeEncryptDialog}
        >
          <form
            onSubmit={(e) => void handleEncryptedDownload(e)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5"
          >
            <div>
              <h3 className="text-base font-semibold text-white">
                {t('backups.encryptTitle')}
              </h3>
              <p className="mt-1 text-xs text-peregrine-400">
                {t('backups.encryptDescription').replace(
                  '{name}',
                  encryptBackup.name,
                )}
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-peregrine-300">
                {t('backups.encryptPasswordLabel')}
              </label>
              <input
                type="password"
                value={encryptPassword}
                onChange={(e) => setEncryptPassword(e.target.value)}
                disabled={encrypting}
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-peregrine-600 focus:border-falcon disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-peregrine-300">
                {t('backups.encryptConfirmLabel')}
              </label>
              <input
                type="password"
                value={encryptConfirm}
                onChange={(e) => setEncryptConfirm(e.target.value)}
                disabled={encrypting}
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-peregrine-600 focus:border-falcon disabled:opacity-50"
              />
            </div>

            <p className="rounded-lg border border-peregrine-800 bg-peregrine-950 p-2 text-[11px] leading-snug text-peregrine-400">
              {t('backups.encryptNotice')}
            </p>

            {encryptError && (
              <p className="text-sm text-rose-400">{encryptError}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeEncryptDialog}
                disabled={encrypting}
                className="rounded-lg border border-peregrine-700 px-3 py-2 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={encrypting}
                className="rounded-lg bg-falcon px-4 py-2 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
              >
                {encrypting
                  ? t('backups.encryptInProgress')
                  : t('backups.encryptAction')}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
