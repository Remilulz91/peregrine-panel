import { useEffect, useState, type FormEvent } from 'react';
import AuthCard from '../components/AuthCard';
import Field from '../components/Field';
import { api, ApiError } from '../lib/api';
import { useTranslation } from '../lib/i18n';

interface InviteProps {
  token: string;
}

/**
 * Invitation acceptance screen. Open when the visitor lands on
 * `/invite/<token>`. The user discovers their username, picks a password
 * (entered twice), and is logged in. The invitation is destroyed
 * server-side as soon as the password is set.
 */
export default function Invite({ token }: InviteProps) {
  const { t } = useTranslation();

  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkValid, setLinkValid] = useState(true);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getInvite(token)
      .then((data) => {
        if (cancelled) return;
        setUsername(data.username);
      })
      .catch(() => {
        if (cancelled) return;
        setLinkValid(false);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t('invite.errorShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('invite.errorMismatch'));
      return;
    }

    setBusy(true);
    try {
      await api.acceptInvite(token, password);
      // Full reload so the AuthProvider re-reads the new session cookie
      // and we land on a clean URL with no /invite/<token> path.
      window.location.href = '/';
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setLinkValid(false);
      } else {
        setError(t('common.errorGeneric'));
      }
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AuthCard>
        <p className="text-center text-sm text-peregrine-400">
          {t('invite.checking')}
        </p>
      </AuthCard>
    );
  }

  if (!linkValid) {
    return (
      <AuthCard>
        <h1 className="text-lg font-semibold text-white">
          {t('invite.title')}
        </h1>
        <p className="mt-3 text-sm text-rose-400">{t('invite.errorInvalid')}</p>
      </AuthCard>
    );
  }

  const welcome = t('invite.welcome').replace('{username}', username ?? '');

  return (
    <AuthCard>
      <h1 className="text-lg font-semibold text-white">{t('invite.title')}</h1>
      <p className="mt-1 text-sm text-peregrine-400">{welcome}</p>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <Field
          id="password"
          label={t('invite.passwordLabel')}
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Field
          id="confirm"
          label={t('invite.confirmLabel')}
          type="password"
          required
          minLength={8}
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
          {busy ? t('common.pleaseWait') : t('invite.submit')}
        </button>
      </form>
    </AuthCard>
  );
}
