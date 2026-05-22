import { useState, type FormEvent } from 'react';
import AuthCard from '../components/AuthCard';
import Field from '../components/Field';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';

/**
 * First-run wizard: shown when the panel has no account yet. It creates
 * the administrator account, then logs that user straight in.
 */
export default function Setup() {
  const { t } = useTranslation();
  const { signIn } = useAuth();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t('setup.errorShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('setup.errorMismatch'));
      return;
    }

    setBusy(true);
    try {
      const { user } = await api.setup({ username, email, password });
      signIn(user);
    } catch {
      setError(t('common.errorGeneric'));
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <h1 className="text-lg font-semibold text-white">{t('setup.title')}</h1>
      <p className="mt-1 text-sm text-peregrine-400">{t('setup.subtitle')}</p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <Field
          id="username"
          label={t('setup.usernameLabel')}
          type="text"
          required
          minLength={3}
          maxLength={32}
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <Field
          id="email"
          label={t('setup.emailLabel')}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="password"
          label={t('setup.passwordLabel')}
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          id="confirm"
          label={t('setup.confirmLabel')}
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? t('common.pleaseWait') : t('setup.submit')}
        </button>
      </form>
    </AuthCard>
  );
}
