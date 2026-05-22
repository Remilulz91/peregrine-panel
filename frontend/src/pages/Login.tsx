import { useState, type FormEvent } from 'react';
import AuthCard from '../components/AuthCard';
import Field from '../components/Field';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTranslation } from '../lib/i18n';

/** Login screen: shown when the panel is set up but nobody is signed in. */
export default function Login() {
  const { t } = useTranslation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { user } = await api.login({ email, password });
      signIn(user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t('login.errorInvalid'));
      } else {
        setError(t('common.errorGeneric'));
      }
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <h1 className="text-lg font-semibold text-white">{t('login.title')}</h1>
      <p className="mt-1 text-sm text-peregrine-400">{t('login.subtitle')}</p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <Field
          id="email"
          label={t('login.emailLabel')}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="password"
          label={t('login.passwordLabel')}
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-falcon px-4 py-2 text-sm font-semibold text-peregrine-950 transition-colors hover:bg-falcon-bright disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? t('common.pleaseWait') : t('login.submit')}
        </button>
      </form>
    </AuthCard>
  );
}
