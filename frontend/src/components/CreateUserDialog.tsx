import { useState, type FormEvent } from 'react';
import Field from './Field';
import { api, ApiError } from '../lib/api';
import { useTranslation } from '../lib/i18n';

interface CreateUserDialogProps {
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Modal for an administrator to create a new account. On success the
 * generated single-use invitation URL is displayed with a "Copy" button —
 * the admin then shares it with the user out-of-band (Discord, email, ...).
 */
export default function CreateUserDialog({
  onClose,
  onCreated,
}: CreateUserDialogProps) {
  const { t } = useTranslation();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await api.createAdminUser({ username, email, role });
      setInviteUrl(result.inviteUrl);
      onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : t('common.errorGeneric'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink(): Promise<void> {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available — keep the input selectable instead.
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6">
        <h2 className="text-lg font-semibold text-white">
          {t('admin.create.title')}
        </h2>
        <p className="mt-1 text-sm text-peregrine-400">
          {t('admin.create.subtitle')}
        </p>

        {inviteUrl ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-peregrine-300">
              {t('admin.invite.ready')}
            </p>
            <input
              readOnly
              value={inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 font-mono text-xs text-white outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void copyLink()}
                className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
              >
                {copied ? t('admin.invite.copied') : t('admin.invite.copy')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <Field
              id="newUsername"
              label={t('admin.create.usernameLabel')}
              type="text"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9._\-]+"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Field
              id="newEmail"
              label={t('admin.create.emailLabel')}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div>
              <label
                htmlFor="newRole"
                className="mb-1 block text-xs font-medium text-peregrine-400"
              >
                {t('admin.create.roleLabel')}
              </label>
              <select
                id="newRole"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value === 'ADMIN' ? 'ADMIN' : 'USER')
                }
                className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon"
              >
                <option value="USER">{t('admin.role.USER')}</option>
                <option value="ADMIN">{t('admin.role.ADMIN')}</option>
              </select>
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
                {busy ? t('common.pleaseWait') : t('admin.create.submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
