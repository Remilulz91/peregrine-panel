import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from 'react';
import {
  api,
  ApiError,
  type ApiServer,
  type ApiSubuser,
} from '../../lib/api';
import {
  useTranslation,
  type TranslationKey,
} from '../../lib/i18n';

interface SubusersPageProps {
  server: ApiServer;
}

// Layout of the permission picker. Each group has a label key and a
// list of (permission, label-key) pairs. Both the picker dialog and
// the readable summary in the table use this structure.
const PERMISSION_GROUPS: {
  groupKey: TranslationKey;
  items: { perm: string; labelKey: TranslationKey }[];
}[] = [
  {
    groupKey: 'perm.group.control',
    items: [
      { perm: 'control.start', labelKey: 'perm.control.start' },
      { perm: 'control.stop', labelKey: 'perm.control.stop' },
      { perm: 'control.restart', labelKey: 'perm.control.restart' },
    ],
  },
  {
    groupKey: 'perm.group.console',
    items: [{ perm: 'console.send', labelKey: 'perm.console.send' }],
  },
  {
    groupKey: 'perm.group.files',
    items: [
      { perm: 'files.write', labelKey: 'perm.files.write' },
      { perm: 'files.delete', labelKey: 'perm.files.delete' },
    ],
  },
  {
    groupKey: 'perm.group.backups',
    items: [
      { perm: 'backups.create', labelKey: 'perm.backups.create' },
      { perm: 'backups.restore', labelKey: 'perm.backups.restore' },
      { perm: 'backups.delete', labelKey: 'perm.backups.delete' },
      { perm: 'backups.download', labelKey: 'perm.backups.download' },
    ],
  },
  {
    groupKey: 'perm.group.settings',
    items: [{ perm: 'settings.rename', labelKey: 'perm.settings.rename' }],
  },
];

/**
 * Permission picker: a grouped checkbox grid with per-group
 * "select all" toggles. Used in both the Invite and Edit dialogs.
 */
function PermissionPicker({
  value,
  onChange,
}: {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const { t } = useTranslation();

  function toggle(perm: string, on: boolean): void {
    const next = new Set(value);
    if (on) next.add(perm);
    else next.delete(perm);
    onChange(next);
  }

  function toggleGroup(perms: string[], on: boolean): void {
    const next = new Set(value);
    for (const p of perms) {
      if (on) next.add(p);
      else next.delete(p);
    }
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {PERMISSION_GROUPS.map((group) => {
        const groupPerms = group.items.map((i) => i.perm);
        const allOn = groupPerms.every((p) => value.has(p));
        return (
          <div
            key={group.groupKey}
            className="rounded-xl border border-peregrine-700 bg-peregrine-950 p-3"
          >
            <label className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-peregrine-300">
              <span>{t(group.groupKey)}</span>
              <span className="flex items-center gap-1.5 text-[10px] font-normal normal-case tracking-normal text-peregrine-500">
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={(e) => toggleGroup(groupPerms, e.target.checked)}
                  className="h-3.5 w-3.5 accent-falcon"
                />
                {t('subusers.permissions.selectAll')}
              </span>
            </label>
            <div className="mt-2 space-y-1.5">
              {group.items.map((item) => (
                <label
                  key={item.perm}
                  className="flex items-start gap-2 text-xs text-peregrine-200"
                >
                  <input
                    type="checkbox"
                    checked={value.has(item.perm)}
                    onChange={(e) => toggle(item.perm, e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-falcon"
                  />
                  <span>{t(item.labelKey)}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface InviteDialogProps {
  serverId: string;
  onClose: () => void;
  onAdded: () => void;
}

function InviteDialog({ serverId, onClose, onAdded }: InviteDialogProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.addSubuser(serverId, email.trim(), Array.from(perms));
      onAdded();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6">
        <h2 className="text-lg font-semibold text-white">
          {t('subusers.invite.title')}
        </h2>
        <p className="mt-1 text-sm text-peregrine-400">
          {t('subusers.invite.subtitle')}
        </p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="sub-email"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('subusers.invite.emailLabel')}
            </label>
            <input
              id="sub-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-peregrine-400">
              {t('subusers.permissions.label')}
            </p>
            <PermissionPicker value={perms} onChange={setPerms} />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('common.pleaseWait') : t('subusers.invite.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditDialogProps {
  serverId: string;
  subuser: ApiSubuser;
  onClose: () => void;
  onUpdated: () => void;
}

function EditDialog({
  serverId,
  subuser,
  onClose,
  onUpdated,
}: EditDialogProps) {
  const { t } = useTranslation();
  const [perms, setPerms] = useState<Set<string>>(
    new Set(subuser.permissions),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.updateSubuser(serverId, subuser.id, Array.from(perms));
      onUpdated();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6">
        <h2 className="text-lg font-semibold text-white">
          {t('subusers.edit.title')}
        </h2>
        <p className="mt-1 text-sm text-peregrine-400">{subuser.username} · {subuser.email}</p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <PermissionPicker value={perms} onChange={setPerms} />
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('common.pleaseWait') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * The "Users" tab: shows everyone who has been granted access to this
 * server, and lets the owner add / edit / remove them. The tab itself
 * is only mounted when the viewer is the owner (or an admin), so we
 * don't repeat that check here.
 */
export default function SubusersPage({ server }: SubusersPageProps) {
  const { t } = useTranslation();
  const [subusers, setSubusers] = useState<ApiSubuser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiSubuser | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listSubusers(server.id);
      setSubusers(result.subusers);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, [server.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRemove(sub: ApiSubuser): Promise<void> {
    if (!window.confirm(t('subusers.removeConfirm'))) return;
    try {
      await api.removeSubuser(server.id, sub.id);
      void load();
    } catch (err) {
      window.alert(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {t('subusers.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-peregrine-400">
            {t('subusers.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="shrink-0 rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright"
        >
          {t('subusers.invite')}
        </button>
      </div>

      {error && (
        <p className="text-sm text-rose-400">{t('subusers.loadError')}</p>
      )}

      {!loaded ? null : subusers.length === 0 && !error ? (
        <div className="rounded-2xl border border-dashed border-peregrine-700 p-8 text-center text-sm text-peregrine-400">
          {t('subusers.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-peregrine-700">
          <table className="min-w-full divide-y divide-peregrine-800 text-sm">
            <thead className="bg-peregrine-900 text-left text-xs uppercase tracking-wider text-peregrine-400">
              <tr>
                <th className="px-4 py-2">{t('subusers.colUser')}</th>
                <th className="px-4 py-2">{t('subusers.colPermissions')}</th>
                <th className="px-4 py-2 text-right">
                  {t('subusers.colActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-peregrine-800 text-peregrine-200">
              {subusers.map((sub) => (
                <tr key={sub.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-white">{sub.username}</div>
                    <div className="text-xs text-peregrine-400">{sub.email}</div>
                  </td>
                  <td className="px-4 py-2 text-xs text-peregrine-300">
                    {t('subusers.permCount').replace(
                      '{count}',
                      String(sub.permissions.length),
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditTarget(sub)}
                        className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
                      >
                        {t('subusers.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemove(sub)}
                        className="rounded-lg border border-peregrine-700 px-2.5 py-1 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
                      >
                        {t('subusers.remove')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inviteOpen && (
        <InviteDialog
          serverId={server.id}
          onClose={() => setInviteOpen(false)}
          onAdded={() => void load()}
        />
      )}

      {editTarget && (
        <EditDialog
          serverId={server.id}
          subuser={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={() => void load()}
        />
      )}
    </section>
  );
}
