import { useState, type FormEvent } from 'react';
import Field from './Field';
import { api, ApiError, type ApiAdminUser } from '../lib/api';
import { useTranslation } from '../lib/i18n';

interface EditUserDialogProps {
  user: ApiAdminUser;
  /** True when the row being edited belongs to the current admin. */
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal for an administrator to edit a user account (v0.33.0+).
 * Fields: username, email, role. Password is not editable here —
 * accounts that have lost their password should be deleted and
 * re-invited.
 */
export default function EditUserDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: EditUserDialogProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<'USER' | 'ADMIN'>(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body: { username?: string; email?: string; role?: 'USER' | 'ADMIN' } = {};
      if (username.trim() !== user.username) body.username = username.trim();
      if (email.trim() !== user.email) body.email = email.trim();
      if (role !== user.role) body.role = role;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      await api.updateAdminUser(user.id, body);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6">
        <h2 className="text-lg font-semibold text-white">
          {t('admin.edit.title')}
        </h2>
        <p className="mt-1 text-sm text-peregrine-400">
          {t('admin.edit.subtitle')}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <Field
            id="edit-user-username"
            label={t('admin.create.usernameLabel')}
            type="text"
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9._\-]+"
            value={username}
            disabled={busy}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Field
            id="edit-user-email"
            label={t('admin.create.emailLabel')}
            type="email"
            required
            value={email}
            disabled={busy}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div>
            <label
              htmlFor="edit-user-role"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('admin.create.roleLabel')}
            </label>
            <select
              id="edit-user-role"
              value={role}
              disabled={busy || isSelf}
              onChange={(e) =>
                setRole(e.target.value === 'ADMIN' ? 'ADMIN' : 'USER')
              }
              className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-falcon disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="USER">{t('admin.role.USER')}</option>
              <option value="ADMIN">{t('admin.role.ADMIN')}</option>
            </select>
            {isSelf && (
              <p className="mt-1 text-xs text-peregrine-500">
                {t('admin.edit.cannotDemoteSelf')}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-peregrine-700 px-4 py-2 text-sm font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t('common.pleaseWait') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
