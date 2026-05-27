import { useState, type FormEvent } from 'react';
import FalconMark from '../components/FalconMark';
import LanguageToggle from '../components/LanguageToggle';
import MfaSetupDialog from '../components/MfaSetupDialog';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/router';
import { useTranslation, type TranslationKey } from '../lib/i18n';

/**
 * User account settings page. Today it shows the bare profile read-only
 * and the security section (MFA enable / disable). More may follow.
 */
export default function Account() {
  const { t } = useTranslation();
  const { user, refresh, signOut } = useAuth();

  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  const mfaEnabled = user?.mfaEnabled === true;
  const remaining = user?.mfaRecoveryRemaining ?? 0;

  function roleKey(role?: string): TranslationKey {
    return role === 'ADMIN' ? 'admin.role.ADMIN' : 'admin.role.USER';
  }

  return (
    <div className="min-h-full bg-peregrine-950 text-peregrine-200">
      <header className="flex items-center gap-3 border-b border-peregrine-800 bg-peregrine-900 px-5 py-3">
        <FalconMark className="h-7 w-7 text-falcon" />
        <span className="text-sm font-bold tracking-[0.18em] text-white">
          PEREGRINE
        </span>
        <div className="flex-1" />
        <LanguageToggle />
        {user && (
          <span className="hidden text-sm text-peregrine-400 sm:inline">
            {user.username}
          </span>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-peregrine-700 px-3 py-1.5 text-xs font-medium text-peregrine-200 transition-colors hover:bg-peregrine-800"
        >
          {t('dashboard.logout')}
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-5 inline-flex items-center gap-1 text-xs font-medium text-peregrine-400 transition-colors hover:text-peregrine-200"
        >
          ← {t('account.back')}
        </button>

        <h1 className="text-2xl font-semibold text-white">
          {t('account.title')}
        </h1>

        {/* Profile (read-only) ---------------------------------------- */}
        <section className="mt-6 rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
          <h2 className="text-sm font-semibold text-white">
            {t('account.profile.title')}
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-peregrine-500">
                {t('account.profile.username')}
              </dt>
              <dd className="mt-0.5 text-white">{user?.username}</dd>
            </div>
            <div>
              <dt className="text-xs text-peregrine-500">
                {t('account.profile.email')}
              </dt>
              <dd className="mt-0.5 text-peregrine-200">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-peregrine-500">
                {t('account.profile.role')}
              </dt>
              <dd className="mt-0.5 text-peregrine-200">
                {t(roleKey(user?.role))}
              </dd>
            </div>
          </dl>
        </section>

        {/* Security / MFA --------------------------------------------- */}
        <section className="mt-6 rounded-2xl border border-peregrine-700 bg-peregrine-900 p-5">
          <h2 className="text-sm font-semibold text-white">
            {t('account.security.title')}
          </h2>
          <h3 className="mt-3 text-sm font-semibold text-peregrine-200">
            {t('account.mfa.title')}
          </h3>
          <p className="mt-1 text-sm text-peregrine-400">
            {t('account.mfa.intro')}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {mfaEnabled ? (
              <>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                  ●{' '}
                  {t('account.mfa.statusOn').replace(
                    '{count}',
                    String(remaining),
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setDisableOpen(true)}
                  className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/10"
                >
                  {t('account.mfa.disable')}
                </button>
              </>
            ) : (
              <>
                <span className="rounded-full bg-peregrine-800 px-2.5 py-1 text-xs text-peregrine-300">
                  {t('account.mfa.statusOff')}
                </span>
                <button
                  type="button"
                  onClick={() => setSetupOpen(true)}
                  className="rounded-lg bg-falcon px-3 py-1.5 text-xs font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright"
                >
                  {t('account.mfa.enable')}
                </button>
              </>
            )}
          </div>
        </section>
      </main>

      {setupOpen && (
        <MfaSetupDialog
          onClose={() => setSetupOpen(false)}
          onActivated={() => void refresh()}
        />
      )}

      {disableOpen && (
        <DisableMfaDialog
          onClose={() => setDisableOpen(false)}
          onDisabled={() => {
            void refresh();
            setDisableOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface DisableMfaDialogProps {
  onClose: () => void;
  onDisabled: () => void;
}

/** Re-asks for the password before turning MFA off. */
function DisableMfaDialog({ onClose, onDisabled }: DisableMfaDialogProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.mfaDisable(password);
      onDisabled();
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
      <div className="w-full max-w-md rounded-2xl border border-peregrine-700 bg-peregrine-900 p-6">
        <h2 className="text-lg font-semibold text-white">
          {t('account.mfa.disable.title')}
        </h2>
        <p className="mt-1 text-sm text-peregrine-400">
          {t('account.mfa.disable.body')}
        </p>
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="disable-pwd"
              className="mb-1 block text-xs font-medium text-peregrine-400"
            >
              {t('account.mfa.disable.passwordLabel')}
            </label>
            <input
              id="disable-pwd"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-peregrine-700 bg-peregrine-950 px-3 py-2 text-sm text-white outline-none focus:border-falcon"
            />
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <div className="flex justify-end gap-2">
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
              className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? t('common.pleaseWait') : t('account.mfa.disable.confirm')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
